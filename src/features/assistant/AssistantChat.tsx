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
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { runAssistant } from './assistantAgent'
import {
  executeAssistantAction,
  undoAssistantAction,
  type ActionDone,
} from './assistantActions'
import { loadMemories, memoryPromptLines } from './assistantMemory'
import {
  clearChat,
  createChatMessage,
  getChatMessages,
  subscribeChat,
  updateChat,
  pendingActionNotes,
  writtenNotes,
  type ChatActionState,
  type ChatMessageRecord,
} from './assistantChatStore'
import AssistantActionCard from './AssistantActionCard'

const EXAMPLE_KEYS = [
  'assistant.example1',
  'assistant.example2',
  'assistant.example3',
  'assistant.example4',
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
        onStep: (step) => {
          updateChat((current) =>
            current.map((item) =>
              item.id === pending.id ? { ...item, steps: [...(item.steps ?? []), step] } : item,
            ),
          )
        },
      })

      patchMessage(pending.id, {
        content: result.ok ? result.reply : result.error,
        error: !result.ok,
        actions: result.ok
          ? result.pending?.map((action) => ({ action, status: 'pending' as const }))
          : undefined,
      })
    } catch (error) {
      patchMessage(pending.id, {
        content: (error as Error).message,
        error: true,
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
    void run(text, true)
  }

  function retry() {
    if (busy) return
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')
    if (!lastUser) return
    void run(lastUser.content, false)
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
              {item.steps && item.steps.length > 0 && (
                <details className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                  <summary className="cursor-pointer select-none">
                    {t('assistant.checked', { n: item.steps.length })}
                  </summary>
                  <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
                    {item.steps.map((step, index) => (
                      <li key={`${item.id}-${index}`} className="border-t border-line pt-1.5">
                        <div className="font-mono text-[10px] text-brand">{step.name}</div>
                        <div className="whitespace-pre-wrap break-words">{step.text}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {loading ? (
                <p className="m-0 text-xs text-muted">{t('assistant.thinking')}</p>
              ) : (
                item.content !== '' && (
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
                )
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
        <p className="m-0 mb-2 text-[11px] text-muted">
          <span className="mr-1" aria-hidden="true">
            ⓘ
          </span>
          {t('assistant.healthNote')}
        </p>
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
          </div>
        )}
      </div>
    </div>
  )
}
