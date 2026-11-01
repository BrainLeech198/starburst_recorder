/**
 * 助手对话的本地存档。
 *
 * 完整页面和悬浮面板读同一份，关掉再打开、刷新页面都还在；
 * 只存文本、工具摘要和动作卡片，不存原始记录——真正的数据还在数据库里。
 *
 * 用一个小型外部 store + useSyncExternalStore：两个入口任何一边更新，
 * 另一边立刻看到。最多留 60 条，够接得上上下文，也不会把 localStorage 撑爆。
 */
import type { AssistantQuestion, AssistantStep } from './assistantAgent'
import { describeAction, type AssistantAction } from './assistantActionBuild'

export type ChatActionStatus = 'pending' | 'done' | 'undone' | 'canceled' | 'failed'
export type ChatQuestionStatus = 'open' | 'answered' | 'skipped'

/** 一道选择题在对话里的状态 */
export interface ChatQuestionState extends AssistantQuestion {
  status: ChatQuestionStatus
  /** 用户选中的选项标签 */
  selected?: string[]
}

/** 一张动作卡片在对话里的状态 */
export interface ChatActionState {
  action: AssistantAction
  status: ChatActionStatus
  /** 写进库以后拿到的记录 id，撤销时用 */
  recordId?: string | null
  /** 覆盖类动作的旧值（睡眠、体重、已存在的记忆） */
  previous?: unknown
  /** 失败时的人话原因 */
  error?: string
}

export interface ChatMessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: AssistantStep[]
  error?: boolean
  actions?: ChatActionState[]
  question?: ChatQuestionState
  at: number
  /** 这一轮从发出到出结果用了多久，显示在轨迹标题上 */
  ms?: number
}

const KEY = 'sb_assistant_chat_v1'
const MAX_MESSAGES = 60

const ACTION_KINDS = new Set([
  'memory',
  'finance',
  'stamp',
  'diary',
  'sleep',
  'weigh',
  'intake',
  'diaryEdit',
  'stampEdit',
  'financeEdit',
  'financeDelete',
  'stampDelete',
  'intakeDelete',
  'sleepDelete',
])

const STATUSES = new Set<ChatActionStatus>(['pending', 'done', 'undone', 'canceled', 'failed'])

let messages: ChatMessageRecord[] = load()
const listeners = new Set<() => void>()

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function newMessageId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeAction(raw: unknown): ChatActionState | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const action = item.action as Record<string, unknown> | undefined
  if (!action || typeof action.kind !== 'string' || !ACTION_KINDS.has(action.kind)) return null
  const status = STATUSES.has(item.status as ChatActionStatus)
    ? (item.status as ChatActionStatus)
    : 'pending'
  return {
    action: action as unknown as AssistantAction,
    status,
    recordId: typeof item.recordId === 'string' ? item.recordId : null,
    previous: item.previous,
    error: typeof item.error === 'string' ? item.error : undefined,
  }
}

function normalizeQuestion(raw: unknown): ChatQuestionState | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.question !== 'string' || item.question.trim() === '') return null
  if (!Array.isArray(item.options)) return null
  const options = item.options
    .map((option) => {
      if (!option || typeof option !== 'object') return null
      const value = option as Record<string, unknown>
      const label = typeof value.label === 'string' ? value.label.trim() : ''
      if (label === '') return null
      return {
        label,
        ...(typeof value.description === 'string' && value.description.trim() !== ''
          ? { description: value.description.trim() }
          : {}),
      }
    })
    .filter((option): option is { label: string; description?: string } => option !== null)
  if (options.length < 2) return null
  const status =
    item.status === 'answered' || item.status === 'skipped' ? item.status : 'open'
  const selected = Array.isArray(item.selected)
    ? item.selected.filter((value): value is string => typeof value === 'string')
    : undefined
  return {
    header: typeof item.header === 'string' ? item.header : '',
    question: item.question,
    options,
    multiSelect: item.multiSelect === true,
    status,
    ...(selected && selected.length > 0 ? { selected } : {}),
  }
}

function normalizeMessage(raw: unknown): ChatMessageRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id === '') return null
  if (item.role !== 'user' && item.role !== 'assistant') return null
  if (typeof item.content !== 'string') return null
  const steps = Array.isArray(item.steps)
    ? item.steps
        .map((step) => {
          if (!step || typeof step !== 'object') return null
          const value = step as Record<string, unknown>
          if (typeof value.name !== 'string' || typeof value.text !== 'string') return null
          return { name: value.name, text: value.text }
        })
        .filter((step): step is AssistantStep => step !== null)
    : undefined
  const actions = Array.isArray(item.actions)
    ? item.actions.map(normalizeAction).filter((action): action is ChatActionState => action !== null)
    : undefined
  const question = normalizeQuestion(item.question)
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    steps: steps && steps.length > 0 ? steps : undefined,
    error: item.error === true,
    actions: actions && actions.length > 0 ? actions : undefined,
    question: question ?? undefined,
    at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : Date.now(),
    ...(typeof item.ms === 'number' && Number.isFinite(item.ms) ? { ms: item.ms } : {}),
  }
}

function load(): ChatMessageRecord[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeMessage)
      .filter((item): item is ChatMessageRecord => item !== null)
      .slice(-MAX_MESSAGES)
  } catch {
    return []
  }
}

function persist() {
  const store = storage()
  if (!store) return
  try {
    store.setItem(KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)))
  } catch {
    // 配额满或隐私模式：对话不存档，但这一轮照常能用
  }
}

export function getChatMessages() {
  return messages
}

export function subscribeChat(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 统一入口：更新后存档并通知所有正在看的界面 */
export function updateChat(
  updater: ChatMessageRecord[] | ((current: ChatMessageRecord[]) => ChatMessageRecord[]),
) {
  messages = typeof updater === 'function' ? updater(messages) : updater
  messages = messages.slice(-MAX_MESSAGES)
  persist()
  for (const listener of [...listeners]) listener()
}

export function clearChat() {
  updateChat([])
}

export function createChatMessage(
  message: Omit<ChatMessageRecord, 'id' | 'at'> & { id?: string },
): ChatMessageRecord {
  return {
    ...message,
    id: message.id ?? newMessageId(),
    at: Date.now(),
  }
}

export function newChatMessageId() {
  return newMessageId()
}

/** 从一条消息创建到现在过了多久；放在这里是因为组件里不能直接调 Date.now */
export function elapsedSince(at: number) {
  return Date.now() - at
}

/** 已经确认写入的动作，拼成下一轮的系统提示 */
export function writtenNotes(list: ChatMessageRecord[] = messages): string[] {
  return list.flatMap((item) =>
    (item.actions ?? [])
      .filter((action) => action.status === 'done')
      .map((action) => describeAction(action.action)),
  )
}

/** 界面上还挂着、没确认的动作，避免模型重复提案 */
export function pendingActionNotes(list: ChatMessageRecord[] = messages): string[] {
  return list.flatMap((item) =>
    (item.actions ?? [])
      .filter((action) => action.status === 'pending')
      .map((action) => describeAction(action.action)),
  )
}
