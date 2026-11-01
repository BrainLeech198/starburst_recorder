/**
 * 共用的聊天界面：完整页面和悬浮面板跑的是同一份代码，
 * 只是外壳（滚动方式、间距）不一样，免得两处各写一套逻辑。
 *
 * 对话、动作卡片都存在本地（assistantChatStore），两个入口共享；
 * 助手能「查」，也能提出「记一笔」——但写库必须等用户点确认。
 *
 * 除了聊天，这里还负责：多段会话的切换、推荐问、图片/文本附件、
 * 运行中的计时，以及上下文与 token 用量。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import type { ChatContentPart } from '@/platform/desktop'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import { exportAllData } from '@/features/health/healthRepo'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { loadReasoning, saveReasoning } from '@/features/ai/aiReasoning'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import Modal from '@/shared/ui/Modal'
import { runAssistant } from './assistantAgent'
import {
  executeAssistantAction,
  undoAssistantAction,
  type ActionDone,
} from './assistantActions'
import { loadMemories, memoryPromptLines } from './assistantMemory'
import { enabledSkills, loadSkills } from './assistantSkills'
import { loadPermission, runsWithoutConfirm } from './assistantPermission'
import AssistantQuestionCard from './AssistantQuestionCard'
import AssistantActionCard from './AssistantActionCard'
import AssistantWorking from './AssistantWorking'
import {
  attachmentPromptText,
  imageParts,
  MAX_ATTACHMENTS,
  readAttachment,
} from './assistantAttachments'
import { contextWindow, formatTokens } from './assistantContext'
import { suggestKeys } from './assistantSuggest'
import {
  clearChat,
  createChatMessage,
  deleteChatSession,
  getChatMessages,
  getChatSessions,
  getCurrentSessionId,
  newChatSession,
  switchChatSession,
  subscribeChat,
  updateChat,
  pendingActionNotes,
  writtenNotes,
  elapsedSince,
  type ChatActionState,
  type ChatAttachment,
  type ChatMessageRecord,
  type ChatQuestionState,
} from './assistantChatStore'

/** 工具结果的第一行：折叠时当作摘要，别整段塞进标题 */
function firstLine(text: string) {
  const line = text.split('\n').find((item) => item.trim() !== '')
  return line?.trim() ?? ''
}

const EXAMPLE_KEYS = [
  'assistant.example1',
  'assistant.example2',
  'assistant.example3',
  'assistant.example4',
  'assistant.example5',
] as const

/**
 * 一条消息变成请求里的 content。
 * 只有最后一条用户消息带图片——旧图每轮都发一遍，上下文会被图片吃光。
 */
function historyContent(item: ChatMessageRecord, withImages: boolean): string | ChatContentPart[] {
  const body = item.content.trim()
  const text = `${body}${attachmentPromptText(item.attachments ?? [])}`.trim()
  const images = withImages && item.role === 'user' ? imageParts(item.attachments ?? []) : []
  if (images.length === 0) return text
  return [{ type: 'text', text: text || '（图片）' }, ...images]
}

export default function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const messages = useSyncExternalStore(subscribeChat, getChatMessages, getChatMessages)
  const sessions = useSyncExternalStore(subscribeChat, getChatSessions, getChatSessions)
  const currentSessionId = useSyncExternalStore(subscribeChat, getCurrentSessionId, getCurrentSessionId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  /** 正在等模型回复的那条占位消息 */
  const [pendingId, setPendingId] = useState<string | null>(null)
  /** 正在写入 / 撤销的卡片："消息id:序号" */
  const [working, setWorking] = useState('')
  /** 配好模型之前一直提示去设置；每次发送都重新读一遍，刚在设置页改完回来立刻能用 */
  const [configured, setConfigured] = useState(() => isConfigured(loadAiConfig()))
  /** 深度思考开关：跟设置页共用同一份 localStorage */
  const [reasoning, setReasoning] = useState(() => loadReasoning())
  /** 还没发出去的附件 */
  const [drafts, setDrafts] = useState<ChatAttachment[]>([])
  /** 会话列表弹窗 */
  const [sessionOpen, setSessionOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pendingId, currentSessionId])

  function patchMessage(id: string, patch: Partial<ChatMessageRecord>) {
    updateChat((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function patchAction(messageId: string, index: number, patch: Partial<ChatActionState>) {
    updateChat((current) =>
      current.map((item) => {
        if (item.id !== messageId || !item.actions) return item
        return {
          ...item,
          actions: item.actions.map((action, position) =>
            position === index ? { ...action, ...patch } : action,
          ),
        }
      }),
    )
  }

  /**
   * 跑一轮。appendUser=false 是「重试」：不重复加用户气泡，只把失败的那条替换掉。
   */
  async function run(text: string, appendUser: boolean, files: ChatAttachment[] = []) {
    const config = loadAiConfig()
    const ready = isConfigured(config)
    setConfigured(ready)

    const attachments = files.slice(0, MAX_ATTACHMENTS)
    const userMessage = appendUser
      ? createChatMessage({
          role: 'user',
          content: text,
          ...(attachments.length > 0 ? { attachments } : {}),
        })
      : null
    const pending = createChatMessage({ role: 'assistant', content: '' })
    // 失败气泡先拿掉，重试时不要叠两条
    updateChat((current) => [
      ...current.filter((item) => !item.error),
      ...(userMessage ? [userMessage] : []),
      pending,
    ])
    setPendingId(pending.id)

    if (!ready) {
      patchMessage(pending.id, {
        content: t('assistant.needConfig'),
        error: true,
      })
      setPendingId(null)
      setBusy(false)
      return
    }

    setBusy(true)
    const permission = loadPermission()
    try {
      // 每轮都取一份最新快照：刚刚在别的页面记的东西也能查到
      const data = await exportAllData()
      // 历史里只放已经说出口的话；正在加载的占位和错误提示都不算
      const source = [...messages, ...(userMessage ? [userMessage] : [])].filter(
        (item) =>
          !item.error && (item.content.trim() !== '' || (item.attachments?.length ?? 0) > 0),
      )
      const lastUserIndex = source.reduce(
        (found, item, index) => (item.role === 'user' ? index : found),
        -1,
      )
      const history = source.map((item, index) => ({
        role: item.role,
        content: historyContent(item, index === lastUserIndex),
      }))

      const result = await runAssistant({
        config,
        history,
        data,
        today: todayKey(),
        memories: memoryPromptLines(loadMemories()),
        notes: writtenNotes(),
        pendingNotes: pendingActionNotes(),
        skills: enabledSkills(),
        permission,
        reasoning,
        onStep: (step) => {
          updateChat((current) =>
            current.map((item) =>
              item.id === pending.id ? { ...item, steps: [...(item.steps ?? []), step] } : item,
            ),
          )
        },
      })

      patchMessage(pending.id, {
        content: result.ok
          ? result.reply || (result.question ? result.question.question : '')
          : result.error,
        error: !result.ok,
        actions: result.ok
          ? result.pending?.map((action) => ({ action, status: 'pending' as const }))
          : undefined,
        question:
          result.ok && result.question
            ? ({ ...result.question, status: 'open' } satisfies ChatQuestionState)
            : undefined,
        ms: elapsedSince(pending.at),
        ...(result.ok && result.usage ? { usage: result.usage } : {}),
        ...(result.ok && result.compacted ? { compacted: result.compacted } : {}),
      })

      // 直接改：新增与修改不用等确认，这里立刻落库；删除仍留在卡片上
      if (result.ok && result.pending) {
        for (const [index, action] of result.pending.entries()) {
          if (!runsWithoutConfirm(permission, action.kind)) continue
          try {
            const done = await executeAssistantAction(action)
            patchAction(pending.id, index, {
              status: 'done',
              recordId: done.recordId,
              previous: done.previous,
            })
          } catch (error) {
            patchAction(pending.id, index, {
              status: 'failed',
              error: (error as Error).message,
            })
          }
        }
      }
    } catch (error) {
      patchMessage(pending.id, {
        content: (error as Error).message,
        error: true,
        ms: elapsedSince(pending.at),
      })
    } finally {
      setPendingId(null)
      setBusy(false)
    }
  }

  function send() {
    const text = input.trim()
    if ((text === '' && drafts.length === 0) || busy) return
    const files = drafts
    setInput('')
    setDrafts([])
    // 用户绕过选择题直接说话：把还挂着的题标成跳过，别让它一直亮着
    updateChat((current) =>
      current.map((item) =>
        item.question?.status === 'open'
          ? { ...item, question: { ...item.question, status: 'skipped' as const } }
          : item,
      ),
    )
    void run(text, true, files)
  }

  function retry() {
    if (busy) return
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')
    if (!lastUser) return
    void run(lastUser.content, false, lastUser.attachments ?? [])
  }

  /** 选择题选完：卡片留痕，再把「我的选择」作为下一条用户消息继续对话 */
  function answerQuestion(messageId: string, selected: string[]) {
    if (busy || working !== '' || selected.length === 0) return
    updateChat((current) =>
      current.map((item) =>
        item.id === messageId && item.question
          ? {
              ...item,
              question: { ...item.question, status: 'answered' as const, selected },
            }
          : item,
      ),
    )
    void run(t('assistant.questionAnswer', { choices: selected.join('、') }), true)
  }

  async function confirmAction(messageId: string, index: number, state: ChatActionState) {
    const key = `${messageId}:${index}`
    if (working !== '' || busy) return
    setWorking(key)
    try {
      const done: ActionDone = await executeAssistantAction(state.action)
      patchAction(messageId, index, {
        status: 'done',
        recordId: done.recordId,
        previous: done.previous,
        error: undefined,
      })
      showToast({ message: t('assistant.action.doneToast') })
    } catch (error) {
      patchAction(messageId, index, {
        status: 'failed',
        error: (error as Error).message,
      })
      showToast({
        message: t('assistant.action.failedToast', { error: (error as Error).message }),
      })
    } finally {
      setWorking('')
    }
  }

  async function undoAction(messageId: string, index: number, state: ChatActionState) {
    const key = `${messageId}:${index}`
    if (working !== '' || busy) return
    setWorking(key)
    try {
      await undoAssistantAction(state.action, {
        recordId: state.recordId ?? null,
        previous: state.previous,
      })
      patchAction(messageId, index, { status: 'undone' })
      showToast({ message: t('assistant.action.undoneToast') })
    } catch (error) {
      showToast({
        message: t('assistant.action.failedToast', { error: (error as Error).message }),
      })
    } finally {
      setWorking('')
    }
  }

  /** 选文件：一次最多带三个，读不了就弹一句原因 */
  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])]
    event.target.value = ''
    if (picked.length === 0) return
    const room = MAX_ATTACHMENTS - drafts.length
    if (room <= 0) {
      showToast({ message: t('assistant.attachLimit') })
      return
    }
    for (const file of picked.slice(0, room)) {
      try {
        const item = await readAttachment(file)
        setDrafts((current) =>
          current.length >= MAX_ATTACHMENTS ? current : [...current, item],
        )
      } catch (error) {
        showToast({ message: (error as Error).message })
      }
    }
  }

  function startNewChat() {
    if (busy) return
    newChatSession()
    setInput('')
    setDrafts([])
  }

  function renderActions(item: ChatMessageRecord) {
    if (!item.actions || item.actions.length === 0) return null
    return (
      <div className="flex w-full flex-col gap-2">
        {item.actions.map((state, index) => (
          <AssistantActionCard
            key={`${item.id}-${index}`}
            state={state}
            busy={working !== '' || busy}
            onConfirm={() => void confirmAction(item.id, index, state)}
            onCancel={() => patchAction(item.id, index, { status: 'canceled' })}
            onUndo={() => void undoAction(item.id, index, state)}
          />
        ))}
      </div>
    )
  }

  /** 最后一条正常回答：推荐问按它的话题挑 */
  const lastReply = [...messages]
    .reverse()
    .find((item) => item.role === 'assistant' && !item.error && item.content.trim() !== '')
  const suggestionKeys = lastReply ? suggestKeys(lastReply.content) : []

  /** 上下文进度：以最后一次请求的提示词长度做分子，模型窗口做分母 */
  const lastWithUsage = [...messages]
    .reverse()
    .find((item) => item.role === 'assistant' && (item.usage?.context ?? 0) > 0)
  const contextUsed = lastWithUsage?.usage?.context ?? 0
  const contextTotal = contextUsed > 0 ? contextWindow(loadAiConfig().model) : 0
  const contextPct =
    contextTotal > 0 ? Math.min(100, Math.round((contextUsed / contextTotal) * 100)) : 0

  const currentSession = sessions.find((item) => item.id === currentSessionId)
  const sessionTitle = currentSession?.title || t('assistant.untitled')

  return (
    <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}>
      {/* 会话工具条：新建对话与历史列表 */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-1 pb-2">
        <p className="m-0 min-w-0 truncate text-[11px] text-muted">{sessionTitle}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={startNewChat}
            disabled={busy}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            {t('assistant.newChat')}
          </button>
          <button
            type="button"
            onClick={() => setSessionOpen(true)}
            aria-label={t('assistant.sessions')}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
          >
            {t('assistant.sessions')} · {sessions.length}
          </button>
        </div>
      </div>

      <div
        className={
          compact
            ? 'min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4'
            : 'flex-1 space-y-3 py-4'
        }
      >
        {!configured && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.needConfig')}</p>
            <Link to="/me/agent/ai" className={SOLID_BUTTON + ' mt-3'}>
              {t('assistant.goSettings')}
            </Link>
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.intro')}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {EXAMPLE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(t(key), true)}
                  className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:text-fg disabled:opacity-60"
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <Link
              to="/me/agent/memory"
              className="mt-2 inline-block text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('assistant.memoryLink', { count: loadMemories().length })}
            </Link>
            <Link
              to="/me/agent/skills"
              className="ml-3 mt-2 inline-block text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
            </Link>
          </div>
        )}

        {messages.map((item) => {
          const loading = item.id === pendingId && item.content === ''
          if (item.role === 'user') {
            const attachments = item.attachments ?? []
            return (
              <div key={item.id} className="flex flex-col items-end gap-1.5">
                {item.content.trim() !== '' && (
                  <p className="m-0 max-w-[85%] whitespace-pre-wrap rounded-xl bg-brand/15 px-3 py-2 text-sm text-fg">
                    {item.content}
                  </p>
                )}
                {attachments.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {attachments.map((file, index) =>
                      file.dataUrl ? (
                        <img
                          key={`${item.id}-att-${index}`}
                          src={file.dataUrl}
                          alt={file.name}
                          className="h-16 w-16 rounded-lg border border-line object-cover"
                        />
                      ) : (
                        <span
                          key={`${item.id}-att-${index}`}
                          className="max-w-[12rem] truncate rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted"
                        >
                          {file.name}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={item.id} className="flex flex-col items-start gap-1">
              {((item.steps && item.steps.length > 0) || loading) && (
                <div className="w-full overflow-hidden rounded-xl border border-line bg-surface-2/70">
                  <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-[11px] text-muted">
                    {loading ? (
                      <AssistantWorking
                        startedAt={item.at}
                        stepName={item.steps?.[item.steps.length - 1]?.name}
                      />
                    ) : (
                      <>
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-hidden="true"
                        />
                        <span>{t('assistant.checked', { n: item.steps?.length ?? 0 })}</span>
                      </>
                    )}
                    {!loading && item.ms !== undefined && (
                      <span className="ml-auto shrink-0 font-mono text-[10px]">
                        {t('assistant.traceMs', { s: (item.ms / 1000).toFixed(1) })}
                      </span>
                    )}
                  </div>
                  {item.steps && item.steps.length > 0 && (
                    <ul className="m-0 list-none divide-y divide-line p-0">
                      {item.steps.map((step, index) => (
                        <li key={`${item.id}-${index}`}>
                          <details className="group px-2.5 py-1.5">
                            <summary className="flex cursor-pointer select-none items-center gap-2 text-[11px]">
                              <span className="font-mono text-[10px] text-brand">{step.name}</span>
                              <span className="min-w-0 flex-1 truncate text-muted">
                                {firstLine(step.text)}
                              </span>
                              <span
                                className="text-[10px] text-muted transition-transform group-open:rotate-180"
                                aria-hidden="true"
                              >
                                ▾
                              </span>
                            </summary>
                            <div className="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-2 text-[11px] text-muted">
                              {step.text}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!loading && item.content !== '' && (
                <div
                  className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    item.error
                      ? 'border border-danger/40 bg-danger/10 text-fg'
                      : 'bg-surface text-fg'
                  }`}
                >
                  {item.content}
                  {item.error && (
                    <button
                      type="button"
                      onClick={retry}
                      disabled={busy}
                      className="mt-2 block rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-60"
                    >
                      {t('assistant.retry')}
                    </button>
                  )}
                </div>
              )}
              {item.compacted !== undefined && item.compacted > 0 && (
                <p className="m-0 text-[10px] text-muted">
                  {t('assistant.compacted', { n: item.compacted })}
                </p>
              )}
              {item.question && (
                <AssistantQuestionCard
                  state={item.question}
                  busy={busy || working !== ''}
                  onAnswer={(selected) => answerQuestion(item.id, selected)}
                />
              )}
              {renderActions(item)}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className={
          compact
            ? 'border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
            : 'sticky bottom-0 border-t border-line bg-bg pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3'
        }
      >
        {/* 上下文用量：只显示服务商真的报了 token 的那种模型 */}
        {contextUsed > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
              <span className="truncate">
                {t('assistant.contextUsage', {
                  used: formatTokens(contextUsed),
                  total: formatTokens(contextTotal),
                  pct: contextPct,
                })}
              </span>
              {lastWithUsage?.usage && (
                <span className="shrink-0 font-mono">
                  {t('assistant.turnTokens', { n: formatTokens(lastWithUsage.usage.total) })}
                </span>
              )}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-1 rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${Math.max(contextPct, 2)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="m-0 min-w-0 text-[11px] text-muted">
            <span className="mr-1" aria-hidden="true">
              ⓘ
            </span>
            {t('assistant.healthNote')}
          </p>
          <button
            type="button"
            aria-pressed={reasoning}
            disabled={busy}
            onClick={() => {
              const next = !reasoning
              setReasoning(next)
              saveReasoning(next)
            }}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-60 ${
              reasoning
                ? 'border-brand text-brand'
                : 'border-line text-muted hover:text-fg'
            }`}
          >
            {t('assistant.reasoning')} · {reasoning ? t('reasoning.on') : t('reasoning.off')}
          </button>
        </div>

        {/* 推荐问：有对话之后一直挂在这里，点一下就等于发出去 */}
        {messages.length > 0 && !busy && suggestionKeys.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestionKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void run(t(key), true)}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-fg"
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {drafts.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="flex max-w-[14rem] items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setDrafts((current) => current.filter((_, at) => at !== index))}
                  aria-label={t('assistant.attachRemove')}
                  className="shrink-0 text-muted transition-colors hover:text-fg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.csv,.log,.yml,.yaml"
            onChange={(event) => void handleFiles(event)}
            className="hidden"
            aria-label={t('assistant.attach')}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || drafts.length >= MAX_ATTACHMENTS}
            aria-label={t('assistant.attach')}
            title={t('assistant.attach')}
            className="shrink-0 rounded-lg border border-line px-2.5 py-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            ＋
          </button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) send()
            }}
            disabled={busy}
            placeholder={t('assistant.inputPlaceholder')}
            aria-label={t('assistant.inputPlaceholder')}
            className={INPUT + ' flex-1'}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || (input.trim() === '' && drafts.length === 0)}
            className={SOLID_BUTTON}
          >
            {t('assistant.send')}
          </button>
        </div>
        {messages.length > 0 && !busy && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => clearChat()}
              className="text-[11px] text-muted transition-colors hover:text-fg"
            >
              {t('assistant.clear')}
            </button>
            <Link
              to="/me/agent/memory"
              className="text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('assistant.memoryLink', { count: loadMemories().length })}
            </Link>
            <Link
              to="/me/agent/skills"
              className="text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
            </Link>
          </div>
        )}
      </div>

      {sessionOpen && (
        <Modal
          size="sm"
          label={t('assistant.sessions')}
          onClose={() => setSessionOpen(false)}
          panelClassName="flex max-h-[70dvh] flex-col"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-medium">{t('assistant.sessions')}</h2>
            <button
              type="button"
              onClick={() => setSessionOpen(false)}
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              {t('assistant.close')}
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="m-0 text-xs text-muted">{t('assistant.sessionEmpty')}</p>
          ) : (
            <ul className="m-0 min-h-0 list-none space-y-1 overflow-y-auto p-0">
              {[...sessions]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((session) => (
                  <li key={session.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        switchChatSession(session.id)
                        setSessionOpen(false)
                      }}
                      className={`min-w-0 flex-1 truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        session.id === currentSessionId
                          ? 'border-brand text-brand'
                          : 'border-line text-muted hover:text-fg'
                      }`}
                    >
                      {session.title || t('assistant.untitled')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChatSession(session.id)}
                      aria-label={t('assistant.sessionDelete')}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-danger"
                    >
                      {t('assistant.sessionDelete')}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}
