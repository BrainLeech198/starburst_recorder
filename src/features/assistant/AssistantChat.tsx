/**
 * 共用的聊天界面：完整页面和悬浮面板跑的是同一份代码，
 * 只是外壳（滚动方式、间距）不一样，免得两处各写一套逻辑。
 *
 * 对话、动作卡片都存在本地（assistantChatStore），两个入口共享；
 * 助手能「查」，也能提出「记一笔」——但写库必须等用户点确认。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import { exportAllData } from '@/features/health/healthRepo'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { loadReasoning, saveReasoning } from '@/features/ai/aiReasoning'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
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
import {
  clearChat,
  createChatMessage,
  getChatMessages,
  subscribeChat,
  updateChat,
  pendingActionNotes,
  writtenNotes,
  elapsedSince,
  type ChatActionState,
  type ChatMessageRecord,
  type ChatQuestionState,
} from './assistantChatStore'
import AssistantActionCard from './AssistantActionCard'

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

export default function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const messages = useSyncExternalStore(subscribeChat, getChatMessages, getChatMessages)
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
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pendingId])

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
  async function run(text: string, appendUser: boolean) {
    const config = loadAiConfig()
    const ready = isConfigured(config)
    setConfigured(ready)

    const userMessage = appendUser ? createChatMessage({ role: 'user', content: text }) : null
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
      const history = [...messages, ...(userMessage ? [userMessage] : [])]
        .filter((item) => !item.error && item.content.trim() !== '')
        .map((item) => ({ role: item.role, content: item.content }))

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
    if (text === '' || busy) return
    setInput('')
    // 用户绕过选择题直接说话：把还挂着的题标成跳过，别让它一直亮着
    updateChat((current) =>
      current.map((item) =>
        item.question?.status === 'open'
          ? { ...item, question: { ...item.question, status: 'skipped' as const } }
          : item,
      ),
    )
    void run(text, true)
  }

  function retry() {
    if (busy) return
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')
    if (!lastUser) return
    void run(lastUser.content, false)
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

  return (
    <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}>
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
            return (
              <div key={item.id} className="flex justify-end">
                <p className="m-0 max-w-[85%] whitespace-pre-wrap rounded-xl bg-brand/15 px-3 py-2 text-sm text-fg">
                  {item.content}
                </p>
              </div>
            )
          }
          return (
            <div key={item.id} className="flex flex-col items-start gap-1">
              {((item.steps && item.steps.length > 0) || loading) && (
                <div className="w-full overflow-hidden rounded-xl border border-line bg-surface-2/70">
                  <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-[11px] text-muted">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full bg-brand ${
                        loading ? 'motion-safe:animate-pulse' : ''
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {loading && !item.steps?.length
                        ? t('assistant.thinking')
                        : t('assistant.checked', { n: item.steps?.length ?? 0 })}
                    </span>
                    {loading && item.steps && item.steps.length > 0 && (
                      <span className="text-brand">{t('assistant.traceRunning')}</span>
                    )}
                    {!loading && item.ms !== undefined && (
                      <span className="ml-auto font-mono text-[10px]">
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
        <div className="flex items-center gap-2">
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
            disabled={busy || input.trim() === ''}
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
    </div>
  )
}
