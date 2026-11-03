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
import { translate } from '@/shared/i18n/context'

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

/** 一条回答的完整快照：重新生成时旧版本留在这里，可以左右切换 */
export interface ChatVariantSnapshot {
  content: string
  steps?: AssistantStep[]
  actions?: ChatActionState[]
  question?: ChatQuestionState
  error?: boolean
  /** 这一版是被用户按「停止」中断的 */
  stopped?: boolean
  ms?: number
  usage?: TokenUsage & { context?: number }
  compacted?: number
  at: number
}

export interface ChatMessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 这条消息带了哪些附件 */
  attachments?: ChatAttachment[]
  steps?: AssistantStep[]
  error?: boolean
  /** 用户按了停止，重新生成或重发即可 */
  stopped?: boolean
  actions?: ChatActionState[]
  question?: ChatQuestionState
  at: number
  /** 这一轮从发出到出结果用了多久，显示在轨迹标题上 */
  ms?: number
  /** 这一轮真实的 token 用量；context 是最后一次请求的提示词长度 */
  usage?: TokenUsage & { context?: number }
  /** 这一轮有多少条较早对话被压缩掉了 */
  compacted?: number
  /** 重新生成留下的回答版本；只有一条时不会生成这个字段 */
  variants?: ChatVariantSnapshot[]
  /** 当前显示第几版，从 0 开始 */
  variantIndex?: number
}

/** 一段会话 */
export interface ChatSession {
  id: string
  /** 空串表示还没起名，界面显示「未命名对话」 */
  title: string
  messages: ChatMessageRecord[]
  createdAt: number
  updatedAt: number
  /** 同一组分叉出来的会话共用一个组 id，界面上用 ‹ 1/2 › 切换 */
  forkGroup?: string
  /** 从哪一段会话分出来的 */
  forkFrom?: string
  /** 分叉点在原会话里的消息序号（保留前多少条） */
  forkAt?: number
}

const SESSIONS_KEY = 'sb_assistant_sessions_v1'
/** 老版本只有一段对话，迁移一次后删掉 */
const LEGACY_KEY = 'sb_assistant_chat_v1'
const MAX_MESSAGES = 60
/** 编辑消息会分叉，上限比原来宽一点；超出时仍优先保住当前会话与刚分叉的来源 */
const MAX_SESSIONS = 30
const MAX_ATTACHMENTS = 3
/** 一条回答最多留几版，再多的重新生成只保留最近的 */
const MAX_VARIANTS = 8

const ACTION_KINDS = new Set([
  'scheduleCreate',
  'scheduleEdit',
  'scheduleDelete',
  'memory',
  'finance',
  'stamp',
  'diary',
  'sleep',
  'weigh',
  'weighEdit',
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
  'profileCreate',
  'profileDelete',
  'weatherEdit',
  'memoryEdit',
  'memoryDelete',
  'training',
  'trainingEdit',
  'trainingDelete',
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

function normalizeSteps(raw: unknown): AssistantStep[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const steps = raw
    .map((step) => {
      if (!step || typeof step !== 'object') return null
      const value = step as Record<string, unknown>
      if (typeof value.name !== 'string' || typeof value.text !== 'string') return null
      return { name: value.name, text: value.text }
    })
    .filter((step): step is AssistantStep => step !== null)
  return steps.length > 0 ? steps : undefined
}

function normalizeVariant(raw: unknown): ChatVariantSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.content !== 'string') return null
  const actions = Array.isArray(item.actions)
    ? item.actions
        .map(normalizeAction)
        .filter((action): action is ChatActionState => action !== null)
    : undefined
  const question = normalizeQuestion(item.question)
  const usage = normalizeUsage(item.usage)
  const steps = normalizeSteps(item.steps)
  return {
    content: item.content,
    ...(steps ? { steps } : {}),
    ...(actions && actions.length > 0 ? { actions } : {}),
    ...(question ? { question } : {}),
    ...(item.error === true ? { error: true } : {}),
    ...(item.stopped === true ? { stopped: true } : {}),
    ...(typeof item.ms === 'number' && Number.isFinite(item.ms) ? { ms: item.ms } : {}),
    ...(usage ? { usage } : {}),
    ...(typeof item.compacted === 'number' && Number.isFinite(item.compacted) && item.compacted > 0
      ? { compacted: item.compacted }
      : {}),
    at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : Date.now(),
  }
}

function normalizeMessage(raw: unknown): ChatMessageRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id === '') return null
  if (item.role !== 'user' && item.role !== 'assistant') return null
  if (typeof item.content !== 'string') return null
  const steps = normalizeSteps(item.steps)
  const actions = Array.isArray(item.actions)
    ? item.actions.map(normalizeAction).filter((action): action is ChatActionState => action !== null)
    : undefined
  const question = normalizeQuestion(item.question)
  const usage = normalizeUsage(item.usage)
  const variants = Array.isArray(item.variants)
    ? item.variants
        .map(normalizeVariant)
        .filter((variant): variant is ChatVariantSnapshot => variant !== null)
        .slice(-MAX_VARIANTS)
    : undefined
  const variantIndex =
    variants && variants.length > 0
      ? Math.min(
          variants.length - 1,
          Math.max(0, typeof item.variantIndex === 'number' ? Math.floor(item.variantIndex) : 0),
        )
      : undefined
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    attachments: normalizeAttachments(item.attachments),
    steps,
    error: item.error === true,
    ...(item.stopped === true ? { stopped: true } : {}),
    actions: actions && actions.length > 0 ? actions : undefined,
    question: question ?? undefined,
    at: typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : Date.now(),
    ...(typeof item.ms === 'number' && Number.isFinite(item.ms) ? { ms: item.ms } : {}),
    ...(usage ? { usage } : {}),
    ...(typeof item.compacted === 'number' && Number.isFinite(item.compacted) && item.compacted > 0
      ? { compacted: item.compacted }
      : {}),
    ...(variants && variants.length > 1 ? { variants, variantIndex } : {}),
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
    ...(typeof item.forkGroup === 'string' && item.forkGroup !== ''
      ? { forkGroup: item.forkGroup }
      : {}),
    ...(typeof item.forkFrom === 'string' && item.forkFrom !== ''
      ? { forkFrom: item.forkFrom }
      : {}),
    ...(typeof item.forkAt === 'number' && Number.isFinite(item.forkAt) && item.forkAt >= 0
      ? { forkAt: Math.floor(item.forkAt) }
      : {}),
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

function trimSessions(extraKeep: string[] = []) {
  if (sessions.length <= MAX_SESSIONS) return
  const protectedIds = new Set([currentId, ...extraKeep])
  const kept = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS)
  // 当前会话和刚分叉出来的来源无论如何都要留下：挤掉末尾一条没被保护的
  for (const id of protectedIds) {
    if (kept.some((item) => item.id === id)) continue
    const item = sessions.find((session) => session.id === id)
    if (!item) continue
    let drop = -1
    for (let at = kept.length - 1; at >= 0; at--) {
      if (!protectedIds.has(kept[at].id)) {
        drop = at
        break
      }
    }
    if (drop >= 0) kept[drop] = item
  }
  sessions = kept
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

/** 导出给备份用：深拷贝，避免后续改动影响正在用的存档；空会话不占备份 */
export function exportChatSessions(): ChatSession[] {
  const used = sessions.filter((session) => session.messages.length > 0)
  return JSON.parse(JSON.stringify(used)) as ChatSession[]
}

/** 从备份文件读会话，逐段走和本地存档同一套校验；空会话丢掉，最多保留 MAX_SESSIONS 段 */
export function normalizeChatSessions(raw: unknown): ChatSession[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeSession)
    .filter((item): item is ChatSession => item !== null && item.messages.length > 0)
    .slice(0, MAX_SESSIONS)
}

export interface ChatImportStats {
  added: number
  updated: number
  skipped: number
}

/**
 * 把备份里的会话并进本机。
 * 融合按会话 id 对齐，只有备份里的 updatedAt 更新才覆盖；替换则整组换成备份内容。
 */
export function importChatSessions(
  incoming: ChatSession[],
  mode: 'merge' | 'replace',
): ChatImportStats {
  const list = incoming.slice(0, MAX_SESSIONS)
  if (list.length === 0) return { added: 0, updated: 0, skipped: 0 }

  if (mode === 'replace') {
    sessions = list
    currentId = list[0].id
    persist()
    notify()
    return { added: list.length, updated: 0, skipped: 0 }
  }

  let added = 0
  let updated = 0
  let skipped = 0
  for (const item of list) {
    const index = sessions.findIndex((session) => session.id === item.id)
    if (index < 0) {
      sessions.push(item)
      added++
      continue
    }
    if (item.updatedAt > sessions[index].updatedAt) {
      sessions[index] = item
      updated++
    } else {
      skipped++
    }
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  if (!sessions.some((session) => session.id === currentId)) currentId = sessions[0]?.id ?? ''
  ensureCurrent()
  trimSessions()
  persist()
  notify()
  return { added, updated, skipped }
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

/** 把一条消息当前展示的内容收成快照；不含 variants 自身，避免套娃 */
export function snapshotOfMessage(item: ChatMessageRecord): ChatVariantSnapshot {
  return {
    content: item.content,
    ...(item.steps && item.steps.length > 0 ? { steps: item.steps } : {}),
    ...(item.actions && item.actions.length > 0 ? { actions: item.actions } : {}),
    ...(item.question ? { question: item.question } : {}),
    ...(item.error ? { error: true } : {}),
    ...(item.stopped ? { stopped: true } : {}),
    ...(item.ms !== undefined ? { ms: item.ms } : {}),
    ...(item.usage ? { usage: item.usage } : {}),
    ...(item.compacted !== undefined ? { compacted: item.compacted } : {}),
    at: item.at,
  }
}

function applySnapshot(
  item: ChatMessageRecord,
  snapshot: ChatVariantSnapshot,
): ChatMessageRecord {
  return {
    ...item,
    content: snapshot.content,
    steps: snapshot.steps,
    actions: snapshot.actions,
    question: snapshot.question,
    error: snapshot.error,
    stopped: snapshot.stopped,
    ms: snapshot.ms,
    usage: snapshot.usage,
    compacted: snapshot.compacted,
  }
}

/** 顶层字段改过以后同步进当前那一版，切回来时不会看到旧状态 */
function syncActiveVariant(item: ChatMessageRecord): ChatMessageRecord {
  if (!item.variants || item.variants.length === 0) return item
  const index = item.variantIndex ?? item.variants.length - 1
  if (!item.variants[index]) return item
  return {
    ...item,
    variants: item.variants.map((variant, at) =>
      at === index ? snapshotOfMessage(item) : variant,
    ),
  }
}

/** 改一条消息；默认把改动同步进当前版本，重新生成 / 切版本时靠它保持状态一致 */
export function patchChatMessage(
  id: string,
  patch: Partial<ChatMessageRecord>,
  syncVariant = true,
) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== id) return item
      const next = { ...item, ...patch }
      return syncVariant ? syncActiveVariant(next) : next
    }),
  )
}

export function patchChatAction(messageId: string, index: number, patch: Partial<ChatActionState>) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== messageId || !item.actions) return item
      const next = {
        ...item,
        actions: item.actions.map((action, position) =>
          position === index ? { ...action, ...patch } : action,
        ),
      }
      return syncActiveVariant(next)
    }),
  )
}

/**
 * 重新生成前先把当前回答留成第 1 版，再把画面清空。
 * 清空时不走 syncActiveVariant——否则会把刚留下来的旧版本也擦掉。
 */
export function beginChatRegeneration(id: string) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== id) return item
      const variants = item.variants?.length ? item.variants : [snapshotOfMessage(item)]
      return {
        ...item,
        variants,
        variantIndex: 0,
        content: '',
        steps: undefined,
        actions: undefined,
        question: undefined,
        error: false,
        stopped: false,
        ms: undefined,
        usage: undefined,
        compacted: undefined,
      }
    }),
  )
}

/** 新回答生成完，追加成一版并切过去 */
export function appendChatVariant(id: string, snapshot: ChatVariantSnapshot) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== id) return item
      const variants = [...(item.variants ?? []), snapshot].slice(-MAX_VARIANTS)
      return {
        ...applySnapshot(item, snapshot),
        variants,
        variantIndex: variants.length - 1,
      }
    }),
  )
}

/** 停止 / 失败时回到生成前那一版，不把空回答留在对话里 */
export function restoreChatVariant(id: string) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== id) return item
      const index = item.variantIndex ?? 0
      const snapshot = item.variants?.[index]
      if (!snapshot) return item
      return { ...applySnapshot(item, snapshot), variants: item.variants, variantIndex: index }
    }),
  )
}

/** 左右切换同一轮回答的版本，越界就绕回另一头 */
export function switchChatVariant(id: string, delta: number) {
  updateChat((current) =>
    current.map((item) => {
      if (item.id !== id || !item.variants || item.variants.length < 2) return item
      const total = item.variants.length
      const index = ((item.variantIndex ?? total - 1) + delta + total) % total
      return {
        ...applySnapshot(item, item.variants[index]),
        variants: item.variants,
        variantIndex: index,
      }
    }),
  )
}

/** 删掉这一条和它之后的所有消息；返回删了几条 */
export function deleteChatFrom(id: string): number {
  const session = sessions.find((item) => item.id === currentId)
  if (!session) return 0
  const index = session.messages.findIndex((item) => item.id === id)
  if (index < 0) return 0
  const removed = session.messages.length - index
  session.messages = session.messages.slice(0, index)
  if (session.messages.length === 0) session.title = ''
  session.updatedAt = Date.now()
  persist()
  notify()
  return removed
}

/** 多选删除：只删点中的消息，其他顺序不变 */
export function deleteChatMessages(ids: string[]) {
  if (ids.length === 0) return
  const drop = new Set(ids)
  const session = sessions.find((item) => item.id === currentId)
  if (!session) return
  session.messages = session.messages.filter((item) => !drop.has(item.id))
  if (session.messages.length === 0) session.title = ''
  session.updatedAt = Date.now()
  persist()
  notify()
}

export interface ChatForkDraft {
  content: string
  attachments?: ChatAttachment[]
}

/**
 * 从当前会话的第 end 条之前分出一支新会话。
 *
 * 编辑用户消息时传 draft，把改写后的那句话接在保留的前缀后面；
 * 原会话一个字都不动，所以旧回答永远找得回来。分支之间用 forkGroup 认亲，
 * 界面上按创建顺序显示 ‹ 1/2 ›。
 */
export function forkChatSession(end: number, draft?: ChatForkDraft): string | null {
  ensureCurrent()
  const source = sessions.find((item) => item.id === currentId)
  if (!source) return null
  const keep = Math.max(0, Math.min(source.messages.length, Math.floor(end)))
  const messages = JSON.parse(
    JSON.stringify(source.messages.slice(0, keep)),
  ) as ChatMessageRecord[]
  if (draft && draft.content.trim() !== '') {
    messages.push(
      createChatMessage({
        role: 'user',
        content: draft.content,
        ...(draft.attachments && draft.attachments.length > 0
          ? { attachments: draft.attachments }
          : {}),
      }),
    )
  }
  if (messages.length === 0) return null

  const now = Date.now()
  const group = source.forkGroup ?? source.id
  const branchNo = sessions.filter((item) => (item.forkGroup ?? item.id) === group).length + 1
  const baseTitle = source.title.trim() || deriveTitle(messages) || translate('assistant.untitled')
  const session: ChatSession = {
    id: newId('s'),
    title: `${baseTitle} · ${translate('assistant.branchTag')} ${branchNo}`.slice(0, 60),
    messages: messages.slice(-MAX_MESSAGES),
    createdAt: now,
    updatedAt: now,
    forkGroup: group,
    forkFrom: source.id,
    forkAt: keep,
  }
  sessions = [session, ...sessions]
  currentId = session.id
  trimSessions([source.id])
  persist()
  notify()
  return session.id
}

/** 同一组分叉出来的会话，按创建时间排；没有分叉就只返回自己 */
export function getForkSiblings(id: string): ChatSession[] {
  const session = sessions.find((item) => item.id === id)
  if (!session) return []
  const group = session.forkGroup ?? session.id
  return sessions
    .filter((item) => (item.forkGroup ?? item.id) === group)
    .sort((a, b) => a.createdAt - b.createdAt)
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

/**
 * 用户已经处理完、但没有写入的动作。
 *
 * 只把「已确认」的卡片传给模型还不够：用户点拒绝、写完又撤销、或写入失败时，
 * 模型看不到结果，就会以为还挂着，甚至重新提一张同样的卡片。这里把结果原样交回去。
 */
export function resolvedActionNotes(list: ChatMessageRecord[] = getChatMessages()): string[] {
  return list.flatMap((item) =>
    (item.actions ?? []).flatMap((action) => {
      const text = describeAction(action.action)
      if (action.status === 'canceled') return [`用户拒绝，没有写入：${text}`]
      if (action.status === 'undone') return [`用户确认写入后又撤销了：${text}`]
      if (action.status === 'failed') {
        return [`用户确认后写入失败${action.error ? `（${action.error}）` : ''}：${text}`]
      }
      return []
    }),
  )
}
