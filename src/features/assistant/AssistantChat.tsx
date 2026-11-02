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
import { Icon } from '@/shared/ui/icons'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
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
import { requestSuggestions, suggestKeys, summarizeSituation } from './assistantSuggest'
import {
  clearChat,
  createChatMessage,
  deleteChatSession,
  getChatMessages,
  getChatSessions,
  getCurrentSessionId,
  newChatSession,
  renameChatSession,
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

/** 会话列表里的时间：「月-日 时:分」，够用又不占地方 */
function whenLabel(at: number) {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}-${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const EXAMPLE_KEYS = [
  'assistant.example1',
  'assistant.example2',
  'assistant.example3',
  'assistant.example4',
  'assistant.example5',
] as const

/**
 * 控件按「形状 + 重量」分档，避免一屏全是同一种圆角胶囊：
 * 圆形主按钮（新对话）、文字 + 计数徽标（历史）、虚线折叠头（推荐问）、
 * 主色芯片（推荐内容）、方形图标钮（附件）、实心胶囊（发送）。
 */
const CHAT_ICON_BRAND =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-on-brand transition hover:opacity-90 active:scale-[0.94] disabled:opacity-40'
const CHAT_TOOL = 'inline-flex h-7 shrink-0 items-center gap-1 px-1 text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50'
const CHAT_COUNT = 'rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted'
const CHAT_CHIP = 'rounded-full bg-brand/10 px-2.5 py-1 text-[11px] text-brand transition-colors hover:bg-brand/20 disabled:opacity-50'
const CHAT_ICON = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base text-muted transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-40'
const CHAT_SEND = 'inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-brand px-4 text-sm font-medium text-on-brand transition hover:opacity-90 active:scale-[0.97] disabled:opacity-40'
const CHAT_ROW = 'flex min-w-0 flex-1 flex-col px-2.5 py-2 text-left transition-colors'

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
  /** 「清空对话」的红色确认弹窗：一点即清太容易误触 */
  const [clearOpen, setClearOpen] = useState(false)
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
  /** 推荐问默认收起，点标题才展开 */
  const [suggestOpen, setSuggestOpen] = useState(false)
  /** 展开后按最后一条回答 id 缓存，已经生成过的不重复请求 */
  const [suggestions, setSuggestions] = useState<{ id: string; items: string[] } | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  /** 正在改名的会话 id 与输入框内容 */
  const [renamingId, setRenamingId] = useState('')
  const [renameText, setRenameText] = useState('')
  /** 待确认删除的会话 id：避免误点 ✕ 就把对话删掉 */
  const [deletingId, setDeletingId] = useState('')
  /** 上一轮已经读出来的整库快照，展开推荐问时直接拿来当「当前情况」 */
  const dataRef = useRef<Awaited<ReturnType<typeof exportAllData>> | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (messages.length === 0 && pendingId === null) return
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
      dataRef.current = data
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

      // 新增自动保存：只有纯新增动作立刻落库，其余仍留在待确认卡片上
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
    setSuggestOpen(false)
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

  /** 提交改名；留空就回到自动命名 */
  function commitRename() {
    if (renamingId === '') return
    renameChatSession(renamingId, renameText)
    setRenamingId('')
    setRenameText('')
  }

  function startRename(id: string, title: string) {
    setDeletingId('')
    setRenamingId(id)
    setRenameText(title)
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

  /**
   * 展开下拉栏时才让模型按最近对话与长期记忆现想三条；
   * 没配模型或请求失败就退回按话题挑的预设，保证下拉栏不会空着。
   */
  async function openSuggestions(reply: ChatMessageRecord) {
    setSuggestOpen(true)
    if (suggestions?.id === reply.id || suggestLoading) return
    setSuggestLoading(true)
    try {
      const config = loadAiConfig()
      const items = isConfigured(config)
        ? await requestSuggestions({
            config,
            recent: messages.map((item) => ({ role: item.role, content: item.content })),
            memories: memoryPromptLines(loadMemories()),
            situation: dataRef.current
              ? summarizeSituation(dataRef.current, todayKey())
              : [],
          })
        : []
      setSuggestions({
        id: reply.id,
        items: items.length > 0 ? items : suggestKeys(reply.content).map((key) => t(key)),
      })
    } catch {
      setSuggestions({ id: reply.id, items: suggestKeys(reply.content).map((key) => t(key)) })
    } finally {
      setSuggestLoading(false)
    }
  }

  /** 最后一条正常回答：推荐问以它为锚点 */
  const lastReply = [...messages]
    .reverse()
    .find((item) => item.role === 'assistant' && !item.error && item.content.trim() !== '')

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
      {/* 会话工具条：标题两行（名字 + 条数），右侧是圆形新建与「历史 + 计数」 */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] text-brand"
          aria-hidden="true"
        >
          ✦
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-xs font-medium text-fg">{sessionTitle}</p>
          <p className="m-0 text-[10px] text-muted">
            {t('assistant.sessionMeta', { n: messages.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          disabled={busy}
          aria-label={t('assistant.newChat')}
          title={t('assistant.newChat')}
          className={CHAT_ICON_BRAND}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setSessionOpen(true)}
          className={CHAT_TOOL}
        >
          {t('assistant.sessions')}
          <span className={CHAT_COUNT}>{sessions.length}</span>
        </button>
      </div>

      <div
        className={
          compact
            ? 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4'
            : 'flex-1 space-y-4 py-4'
        }
      >
        {!configured && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.needConfig')}</p>
            <Link to="/me/agent/ai" className={SOLID_BUTTON + ' mt-3'}>
              <Icon name="settings" />
              {t('assistant.goSettings')}
            </Link>
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="m-0 text-sm text-fg">{t('assistant.intro')}</p>
            <div className="mt-2 flex flex-col gap-1">
              {EXAMPLE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(t(key), true)}
                  className="group flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-left text-xs text-fg transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] text-brand" aria-hidden="true">
                    ▸
                  </span>
                  <span className="min-w-0 flex-1">{t(key)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <Link to="/me/agent/memory" className="transition-colors hover:text-brand">
                {t('assistant.memoryLink', { count: loadMemories().length })}
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/me/agent/skills" className="transition-colors hover:text-brand">
                {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
              </Link>
            </div>
          </div>
        )}

        {messages.map((item) => {
          const loading = item.id === pendingId && item.content === ''
          if (item.role === 'user') {
            const attachments = item.attachments ?? []
            return (
              <div key={item.id} className="flex flex-col items-end gap-1.5">
                {item.content.trim() !== '' && (
                  <p className="m-0 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand/15 px-3.5 py-2 text-sm text-fg">
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
            <div key={item.id} className="flex flex-col items-start gap-1.5">
              {((item.steps && item.steps.length > 0) || loading) && (
                <div className="w-full overflow-hidden rounded-2xl border border-line/70 bg-surface-2/60">
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
                  className={`max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm leading-relaxed ${
                    item.error
                      ? 'border-danger/40 bg-danger/10 text-fg'
                      : 'border-line bg-surface text-fg'
                  }`}
                >
                  {item.content}
                  {item.error && (
                    <button
                      type="button"
                      onClick={retry}
                      disabled={busy}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-danger underline-offset-2 transition-colors hover:underline disabled:opacity-50"
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
            className="inline-flex h-6 shrink-0 items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-fg disabled:opacity-50"
          >
            <span
              className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${
                reasoning ? 'bg-brand' : 'bg-surface-2 ring-1 ring-inset ring-line'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] duration-150 motion-reduce:transition-none ${
                  reasoning ? 'left-3' : 'left-0.5'
                }`}
              />
            </span>
            <span className={reasoning ? 'text-brand' : ''}>{t('assistant.reasoning')}</span>
          </button>
        </div>

        {/* 推荐问：默认收起，展开时让模型按对话与记忆现想三条 */}
        {messages.length > 0 && !busy && lastReply && (
          <div className="mb-2">
            <button
              type="button"
              aria-expanded={suggestOpen}
              onClick={() => {
                if (suggestOpen) setSuggestOpen(false)
                else void openSuggestions(lastReply)
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand/30 bg-brand/[0.04] px-2.5 py-1.5 text-left text-[11px] text-brand transition-colors hover:bg-brand/10"
            >
              <span aria-hidden="true">✦</span>
              <span className="min-w-0 flex-1">{t('assistant.suggestTitle')}</span>
              <span
                className={`text-[10px] transition-transform ${
                  suggestOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
            {suggestOpen &&
              (suggestLoading ? (
                <p className="m-0 mt-1.5 text-[11px] text-muted">
                  {t('assistant.suggestLoading')}
                </p>
              ) : (
                suggestions?.items.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {suggestions.items.map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => {
                          setSuggestOpen(false)
                          void run(text, true)
                        }}
                        className={CHAT_CHIP}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                ) : null
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
            className={CHAT_ICON}
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
            className={CHAT_SEND}
          >
            {t('assistant.send')}
          </button>
        </div>
        {messages.length > 0 && !busy && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-danger/40 px-2.5 py-1 text-[11px] text-danger transition-colors hover:bg-danger/10 active:scale-[0.97]"
            >
              <Icon name="trash" className="h-3 w-3 shrink-0" />
              {t('assistant.clear')}
            </button>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
              <Link to="/me/agent/memory" className="transition-colors hover:text-brand">
                {t('assistant.memoryLink', { count: loadMemories().length })}
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/me/agent/skills" className="transition-colors hover:text-brand">
                {t('assistant.skillsLink', { count: loadSkills().filter((skill) => skill.enabled).length })}
              </Link>
            </div>
          </div>
        )}
      </div>

      {sessionOpen && (
        <Modal
          size="sm"
          label={t('assistant.sessions')}
          onClose={() => {
            setSessionOpen(false)
            setRenamingId('')
            setDeletingId('')
          }}
          panelClassName="flex max-h-[70dvh] flex-col"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-medium">{t('assistant.sessions')}</h2>
            <button
              type="button"
              onClick={() => setSessionOpen(false)}
              aria-label={t('common.close')}
              title={t('common.close')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              ✕
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="m-0 text-xs text-muted">{t('assistant.sessionEmpty')}</p>
          ) : (
            <ul className="m-0 min-h-0 list-none space-y-1.5 overflow-y-auto p-0">
              {[...sessions]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((session) => {
                  const active = session.id === currentSessionId
                  const renaming = renamingId === session.id
                  const confirming = deletingId === session.id
                  return (
                    <li
                      key={session.id}
                      className={`rounded-xl border transition-colors ${
                        active ? 'border-brand/30 bg-brand/[0.06]' : 'border-transparent'
                      }`}
                    >
                      {renaming ? (
                        <div className="flex items-center gap-1.5 p-2">
                          <input
                            autoFocus
                            value={renameText}
                            onChange={(event) => setRenameText(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.nativeEvent.isComposing) commitRename()
                              if (event.key === 'Escape') setRenamingId('')
                            }}
                            placeholder={t('assistant.renameHint')}
                            aria-label={t('assistant.rename')}
                            className={INPUT + ' h-8 flex-1 text-xs'}
                          />
                          <button
                            type="button"
                            onClick={commitRename}
                            className="shrink-0 text-[11px] font-medium text-brand transition-colors hover:opacity-80"
                          >
                            {t('assistant.renameSave')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId('')}
                            className="shrink-0 text-[11px] text-muted transition-colors hover:text-fg"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              switchChatSession(session.id)
                              setSessionOpen(false)
                            }}
                            className={CHAT_ROW}
                          >
                            <span
                              className={`truncate text-xs ${
                                active ? 'font-medium text-brand' : 'text-fg'
                              }`}
                            >
                              {session.title || t('assistant.untitled')}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
                              {t('assistant.sessionMeta', { n: session.messages.length })}
                              <span aria-hidden="true">·</span>
                              {whenLabel(session.updatedAt)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(session.id, session.title)}
                            aria-label={t('assistant.rename')}
                            title={t('assistant.rename')}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-brand"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId('')
                              setDeletingId(confirming ? '' : session.id)
                            }}
                            aria-label={t('assistant.sessionDelete')}
                            title={t('assistant.sessionDelete')}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {confirming && (
                        <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-1.5">
                          <span className="min-w-0 truncate text-[11px] text-danger">
                            {t('assistant.sessionDeleteConfirm', {
                              title: session.title || t('assistant.untitled'),
                            })}
                          </span>
                          <div className="flex shrink-0 items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setDeletingId('')}
                              className="text-muted transition-colors hover:text-fg"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                deleteChatSession(session.id)
                                setDeletingId('')
                              }}
                              className="font-medium text-danger transition-opacity hover:opacity-80"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
            </ul>
          )}
        </Modal>
      )}

      {clearOpen && (
        <ConfirmDialog
          title={t('assistant.clearTitle')}
          description={t('assistant.clearDesc')}
          confirmLabel={t('assistant.clear')}
          tone="danger"
          onConfirm={() => {
            clearChat()
            setClearOpen(false)
          }}
          onCancel={() => setClearOpen(false)}
        />
      )}
    </div>
  )
}
