/**
 * 助手的长期记忆：偏好、目标、习惯、事实。
 *
 * 跟 AI 配置一样存在 localStorage，不动数据库版本：
 * 记忆是「助手这个人设的一部分」，和模型 key 同层，换设备时各存各的。
 *
 * 三条约束：
 *   1. 只有用户点过确认的内容才写进来，助手不能自己偷偷记
 *   2. 同一条重复说只保留一份，避免「不吃香菜」记十遍
 *   3. 最多 200 条、每条 300 字，防止模型把整篇日记塞成记忆
 */
import { newId } from '@/core/utils/id'

export type AssistantMemoryKind = 'preference' | 'goal' | 'habit' | 'fact'

export interface AssistantMemory {
  id: string
  kind: AssistantMemoryKind
  text: string
  createdAt: number
  updatedAt: number
  /** 谁记下的：用户在设置页手写，还是对话里确认的 */
  source: 'user' | 'assistant'
}

const KEY = 'sb_assistant_memories'
/** 100 条够用了：再多模型也读不过来，提示词会被撑爆 */
export const MAX_MEMORIES = 100
export const MAX_MEMORY_TEXT = 300

const KINDS: AssistantMemoryKind[] = ['preference', 'goal', 'habit', 'fact']

/** 模型看的固定中文标签；界面上的标签走 i18n */
const KIND_LABEL: Record<AssistantMemoryKind, string> = {
  preference: '偏好',
  goal: '目标',
  habit: '习惯',
  fact: '事实',
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // 隐私模式下访问 localStorage 会抛错，当作没有存储
    return null
  }
}

function isKind(value: unknown): value is AssistantMemoryKind {
  return KINDS.includes(value as AssistantMemoryKind)
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_MEMORY_TEXT) : ''
}

/**
 * 把存下来的数组收成合法形状：缺 text / kind 的丢掉，重复文字只留最早的一条。
 * 导出成纯函数，单测不用碰 localStorage。
 */
export function normalizeMemories(raw: unknown): AssistantMemory[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: AssistantMemory[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const text = cleanText(item.text)
    if (text === '' || !isKind(item.kind)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
      ? item.createdAt
      : Date.now()
    list.push({
      id: typeof item.id === 'string' && item.id !== '' ? item.id : newId(),
      kind: item.kind,
      text,
      createdAt,
      updatedAt:
        typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
          ? item.updatedAt
          : createdAt,
      source: item.source === 'assistant' ? 'assistant' : 'user',
    })
    if (list.length >= MAX_MEMORIES) break
  }
  return list
}

export function loadMemories(): AssistantMemory[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(KEY)
    return raw ? normalizeMemories(JSON.parse(raw) as unknown) : []
  } catch {
    return []
  }
}

function persist(list: AssistantMemory[]) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(KEY, JSON.stringify(list))
  } catch {
    // 配额满了：这轮记忆写不进去，但不该让对话崩掉
  }
}

export interface MemoryInput {
  text: string
  kind?: AssistantMemoryKind
  source?: 'user' | 'assistant'
}

/**
 * 新增一条。文字已经存在时只更新分类，不新增第二条；
 * 返回值里 existing=true 让界面能说「已经记过了」。
 */
export function addMemory(input: MemoryInput): { memory: AssistantMemory; existing: boolean } | null {
  const text = cleanText(input.text)
  if (text === '') return null
  const kind = isKind(input.kind) ? input.kind : 'fact'
  const source = input.source === 'assistant' ? 'assistant' : 'user'
  const list = loadMemories()
  const found = list.find((item) => item.text.toLowerCase() === text.toLowerCase())
  const now = Date.now()

  if (found) {
    const next = list.map((item) =>
      item.id === found.id ? { ...item, kind, updatedAt: now } : item,
    )
    persist(next)
    return { memory: { ...found, kind, updatedAt: now }, existing: true }
  }

  const memory: AssistantMemory = {
    id: newId(),
    kind,
    text,
    createdAt: now,
    updatedAt: now,
    source,
  }
  // 新的放前面：设置页一眼能看到刚记的
  persist([memory, ...list].slice(0, MAX_MEMORIES))
  return { memory, existing: false }
}

export function updateMemory(
  id: string,
  patch: { text?: string; kind?: AssistantMemoryKind },
): AssistantMemory | null {
  const list = loadMemories()
  const target = list.find((item) => item.id === id)
  if (!target) return null
  const text = patch.text === undefined ? target.text : cleanText(patch.text)
  if (text === '') return null
  const kind = isKind(patch.kind) ? patch.kind : target.kind
  const next: AssistantMemory = { ...target, text, kind, updatedAt: Date.now() }
  persist(list.map((item) => (item.id === id ? next : item)))
  return next
}

export function removeMemory(id: string) {
  persist(loadMemories().filter((item) => item.id !== id))
}

export function clearMemories() {
  persist([])
}

/** 拼进系统提示的「你记得的事」：带分类前缀，模型更容易分清是偏好还是目标 */
export function memoryPromptLines(list: AssistantMemory[] = loadMemories()): string[] {
  return list.map((item) => `${KIND_LABEL[item.kind]}：${item.text}`)
}
