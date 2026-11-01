/**
 * 助手对话的本地存档。
 *
 * 完整页面和悬浮面板读同一份，关掉再打开、刷新页面都还在；
 * 只存文本、工具摘要和动作卡片，不存原始记录——真正的数据还在数据库里。
 *
 * 按「会话」分组：每段会话有自己的标题和消息，可以新建、切换、删除，
 * 像常见的 AI 助手那样，不必一个对话从早聊到晚。旧的单对话存档会在第一次
 * 读取时搬成第一段会话。
 *
 * 用一个小型外部 store + useSyncExternalStore：两个入口任何一边更新，
 * 另一边立刻看到。每段会话最多留 60 条，不会把 localStorage 撑爆。
 */
import type { AssistantQuestion, AssistantStep } from './assistantAgent'
import { describeAction, type AssistantAction } from './assistantActionBuild'
import type { TokenUsage } from './assistantContext'

export type ChatActionStatus = 'pending' | 'done' | 'undone' | 'canceled' | 'failed'
export type ChatQuestionStatus = 'open' | 'answered' | 'skipped'

/** 一条随消息发出的附件：图片存 dataURL，文本文件存正文 */
export interface ChatAttachment {
  name: string
  dataUrl?: string
  text?: string
}

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
  /** 这条消息带了哪些附件 */
  attachments?: ChatAttachment[]
  steps?: AssistantStep[]
  error?: boolean
  actions?: ChatActionState[]
  question?: ChatQuestionState
  at: number
  /** 这一轮从发出到出结果用了多久，显示在轨迹标题上 */
  ms?: number
  /** 这一轮真实的 token 用量；context 是最后一次请求的提示词长度 */
  usage?: TokenUsage & { context?: number }
  /** 这一轮有多少条较早对话被压缩掉了 */
  compacted?: number
}

/** 一段会话 */
export interface ChatSession {
  id: string
  /** 空串表示还没起名，界面显示「未命名对话」 */
  title: string
  messages: ChatMessageRecord[]
  createdAt: number
  updatedAt: number
}

const SESSIONS_KEY = 'sb_assistant_sessions_v1'
/** 老版本只有一段对话，迁移一次后删掉 */
const LEGACY_KEY = 'sb_assistant_chat_v1'
const MAX_MESSAGES = 60
const MAX_SESSIONS = 20
const MAX_ATTACHMENTS = 3

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
  'diaryDelete',
  'intakeEdit',
  'sleepEdit',
  'weighDelete',
  'foodCreate',
  'foodEdit',
  'foodDelete',
  'mealCreate',
  'mealEdit',
  'mealDelete',
  'presetCreate',
  'presetEdit',
  'presetDelete',
  'profileEdit',
  'weatherEdit',
  'memoryEdit',
  'memoryDelete',
])

const STATUSES = new Set<ChatActionStatus>(['pending', 'done', 'undone', 'canceled', 'failed'])

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function newMessageId() {
  return newId('m')
}

/** 会话标题取第一条用户消息的前 24 个字，换行压成空格 */
function deriveTitle(messages: ChatMessageRecord[]): string {
  const first = messages.find((item) => item.role === 'user' && item.content.trim() !== '')
  if (!first) return ''
  const text = first.content.replace(/\s+/g, ' ').trim()
  return text.length > 24 ? `${text.slice(0, 24)}…` : text
}

function normalizeAttachments(raw: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const list = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 120) : ''
      if (name === '') return null
      return {
        name,
        ...(typeof value.dataUrl === 'string' && value.dataUrl !== ''
          ? { dataUrl: value.dataUrl }
          : {}),
        ...(typeof value.text === 'string' && value.text !== '' ? { text: value.text } : {}),
      }
    })
    .filter((item): item is ChatAttachment => item !== null)
    .slice(0, MAX_ATTACHMENTS)
  return list.length > 0 ? list : undefined
}

function normalizeUsage(raw: unknown): (TokenUsage & { context?: number }) | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  const num = (key: string) => {
    const entry = value[key]
    return typeof entry === 'number' && Number.isFinite(entry) && entry >= 0 ? entry : 0
  }
  const usage = {
    prompt: num('prompt'),
    completion: num('completion'),
    total: num('total'),
    ...(num('context') > 0 ? { context: num('context') } : {}),
  }
  return usage.prompt + usage.completion > 0 ? usage : undefined
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
  const usage = normalizeUsage(item.usage)
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    attachments: normalizeAttachments(item.attachments),
    steps: steps && steps.length > 0 ? steps : undefined,
    error: item.error === true,
    actions: actions && actions.length > 0 ? actions : undefined,
    question: question ?? undefined,
    at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : Date.now(),
    ...(typeof item.ms === 'number' && Number.isFinite(item.ms) ? { ms: item.ms } : {}),
    ...(usage ? { usage } : {}),
    ...(typeof item.compacted === 'number' && Number.isFinite(item.compacted) && item.compacted > 0
      ? { compacted: item.compacted }
      : {}),
  }
}

function normalizeMessages(raw: unknown): ChatMessageRecord[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeMessage)
    .filter((item): item is ChatMessageRecord => item !== null)
    .slice(-MAX_MESSAGES)
}

function newSession(): ChatSession {
  const now = Date.now()
  return { id: newId('s'), title: '', messages: [], createdAt: now, updatedAt: now }
}

function normalizeSession(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id === '') return null
  const messages = normalizeMessages(item.messages)
  const now = Date.now()
  return {
    id: item.id,
    title: typeof item.title === 'string' ? item.title.slice(0, 60) : deriveTitle(messages),
    messages,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
  }
}

/** 老版本的单一对话：搬成一段会话，搬完删掉旧键，避免重复出现 */
function loadLegacy(): ChatSession | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(LEGACY_KEY)
    if (!raw) return null
    const messages = normalizeMessages(JSON.parse(raw) as unknown)
    store.removeItem(LEGACY_KEY)
    if (messages.length === 0) return null
    const session = newSession()
    session.messages = messages
    session.title = deriveTitle(messages)
    return session
  } catch {
    return null
  }
}

function load(): { sessions: ChatSession[]; currentId: string } {
  const store = storage()
  if (!store) return { sessions: [], currentId: '' }
  try {
    const raw = store.getItem(SESSIONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { current?: unknown; sessions?: unknown }
      const list = Array.isArray(parsed.sessions)
        ? parsed.sessions.map(normalizeSession).filter((item): item is ChatSession => item !== null)
        : []
      if (list.length > 0) {
        const current = typeof parsed.current === 'string' ? parsed.current : ''
        return {
          sessions: list.slice(0, MAX_SESSIONS),
          currentId: list.some((item) => item.id === current) ? current : list[0].id,
        }
      }
    }
  } catch {
    // 存档坏了就当没有，重新开始
  }
  const legacy = loadLegacy()
  if (legacy) return { sessions: [legacy], currentId: legacy.id }
  return { sessions: [], currentId: '' }
}

const loaded = load()
let sessions: ChatSession[] = loaded.sessions
let currentId: string = loaded.currentId
const listeners = new Set<() => void>()

/** 保证随时有一段可用的会话；空着也先建一段，界面就不用处理 null */
function ensureCurrent() {
  if (sessions.length === 0) {
    const session = newSession()
    sessions = [session]
    currentId = session.id
    return
  }
  if (!sessions.some((item) => item.id === currentId)) currentId = sessions[0].id
}

function trimSessions() {
  if (sessions.length <= MAX_SESSIONS) return
  // 留最近的，但当前这段无论如何不能丢
  const keep = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
  if (!keep.some((item) => item.id === currentId)) {
    const current = sessions.find((item) => item.id === currentId)
    if (current) keep[MAX_SESSIONS - 1] = current
  }
  sessions = keep
}

function persist() {
  const store = storage()
  if (!store) return
  try {
    store.setItem(SESSIONS_KEY, JSON.stringify({ current: currentId, sessions }))
  } catch {
    // 配额满或隐私模式：对话不存档，但这一轮照常能用
  }
}

function notify() {
  for (const listener of [...listeners]) listener()
}

ensureCurrent()

/** 当前会话的消息 */
export function getChatMessages() {
  return sessions.find((item) => item.id === currentId)?.messages ?? []
}

/** 全部会话，按最近使用排在前面 */
export function getChatSessions() {
  return sessions
}

export function getCurrentSessionId() {
  return currentId
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
  ensureCurrent()
  const session = sessions.find((item) => item.id === currentId)
  if (!session) return
  const current = session.messages
  const next = typeof updater === 'function' ? updater(current) : updater
  session.messages = next.slice(-MAX_MESSAGES)
  session.updatedAt = Date.now()
  if (session.title === '') session.title = deriveTitle(session.messages)
  trimSessions()
  persist()
  notify()
}

/** 清空当前这段对话，标题也回到未命名 */
export function clearChat() {
  const session = sessions.find((item) => item.id === currentId)
  if (!session) return
  session.messages = []
  session.title = ''
  session.updatedAt = Date.now()
  persist()
  notify()
}

/** 开一段新对话；当前这段本来就是空的就直接复用，免得堆一串空会话 */
export function newChatSession() {
  ensureCurrent()
  if (getChatMessages().length === 0) return currentId
  const session = newSession()
  sessions = [session, ...sessions]
  currentId = session.id
  trimSessions()
  persist()
  notify()
  return currentId
}

export function switchChatSession(id: string) {
  if (!sessions.some((item) => item.id === id)) return
  currentId = id
  persist()
  notify()
}

/** 手动改会话标题；留空就交还给「取第一条用户消息」的自动命名 */
export function renameChatSession(id: string, title: string) {
  const session = sessions.find((item) => item.id === id)
  if (!session) return
  session.title = title.trim().slice(0, 40)
  if (session.title === '') session.title = deriveTitle(session.messages)
  session.updatedAt = Date.now()
  persist()
  notify()
}

export function deleteChatSession(id: string) {
  sessions = sessions.filter((item) => item.id !== id)
  ensureCurrent()
  persist()
  notify()
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
export function writtenNotes(list: ChatMessageRecord[] = getChatMessages()): string[] {
  return list.flatMap((item) =>
    (item.actions ?? [])
      .filter((action) => action.status === 'done')
      .map((action) => describeAction(action.action)),
  )
}

/** 界面上还挂着、没确认的动作，避免模型重复提案 */
export function pendingActionNotes(list: ChatMessageRecord[] = getChatMessages()): string[] {
  return list.flatMap((item) =>
    (item.actions ?? [])
      .filter((action) => action.status === 'pending')
      .map((action) => describeAction(action.action)),
  )
}
