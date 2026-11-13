/**
 * 上下文用量与历史压缩。
 *
 * 三件事都在这里，都是纯函数，方便单测：
 *   1. 从服务商返回里读出真实 usage（不支持的厂商返回 null，界面就不显示进度条）
 *   2. 按模型名猜上下文窗口，谁都猜不到时用 128k 兜底
 *   3. 发请求前把太长的历史压一压，并告诉界面这次省掉了多少条
 *
 * token 估算只用字符量：中文一个字按 1 token，其它语言按 4 个字符 1 token。
 * 这只是一个够用的近似，真实数字以服务商返回的 usage 为准。
 */
import type { ChatContentPart } from '@/platform/desktop'

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
}

/** 一条可以进上下文的历史消息；图片分段原样保留 */
export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string | ChatContentPart[]
}

/** 从响应体里读 usage；读不到就返回 null，不要编数字 */
export function parseUsage(body: string): TokenUsage | null {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  const usage = (data as { usage?: Record<string, unknown> } | null)?.usage
  if (!usage || typeof usage !== 'object') return null

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = usage[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
    }
    return 0
  }

  // OpenAI 用 prompt/completion，Anthropic 兼容层用 input/output
  const prompt = pick('prompt_tokens', 'input_tokens')
  const completion = pick('completion_tokens', 'output_tokens')
  const total = pick('total_tokens') || prompt + completion
  if (prompt + completion === 0) return null
  return { prompt, completion, total }
}

/** 粗估一段文字的 token 数 */
export function estimateTokens(text: string): number {
  let wide = 0
  let narrow = 0
  for (const char of text) {
    // 中日韩文字与全角标点大约 1 字 1 token，其余语言 4 字符 1 token
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(char)) wide++
    else narrow++
  }
  return wide + Math.ceil(narrow / 4)
}

/**
 * 模型名里能看出窗口大小就先按它来：
 *   gemini / 名字里带 1m → 1M
 *   claude → 200k
 *   moonshot-v1-8k / -32k / -128k 这种后缀 → 按后缀
 *   其余按 128k（主流在线模型基本都是这个量级）
 */
export function contextWindow(model: string): number {
  const name = model.toLowerCase()
  if (name.includes('gemini') || /\b1m\b/.test(name)) return 1_048_576
  if (name.includes('claude')) return 200_000
  for (const [suffix, size] of [
    ['-8k', 8_192],
    ['-16k', 16_384],
    ['-32k', 32_768],
    ['-128k', 131_072],
  ] as const) {
    if (name.includes(suffix)) return size
  }
  return 128_000
}

/** 把数字收成 1.2k / 1.0m 这种好读的样子 */
export function formatTokens(value: number) {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) {
    const text = (value / 1_000).toFixed(1)
    return `${text.endsWith('.0') ? text.slice(0, -2) : text}k`
  }
  return `${(value / 1_000_000).toFixed(1)}m`
}

export interface CompactOptions {
  /** 历史 token 预算；提供时只在超预算后压缩，不启用固定条数 / 字数上限。 */
  maxTokens?: number
  /** 最多留几条消息 */
  maxMessages?: number
  /** 单条正文最多留多少字，超出的截断 */
  maxChars?: number
  /** 当前最新用户消息保留的上限；超过时从中间压缩，保住开头和结尾 */
  maxLatestUserChars?: number
}

export interface CompactResult {
  messages: HistoryMessage[]
  /** 被省略或裁短的消息条数，界面用它显示「已压缩」 */
  dropped: number
}

const ESTIMATED_IMAGE_TOKENS = 1_024

function historyMessageTokens(message: HistoryMessage) {
  const content: ChatContentPart[] = typeof message.content === 'string'
    ? [{ type: 'text', text: message.content }]
    : message.content
  return 4 + content.reduce(
    (total, part) => total + (part.type === 'text' ? estimateTokens(part.text) : ESTIMATED_IMAGE_TOKENS),
    0,
  )
}

function textWithinTokenBudget(text: string, budget: number) {
  if (estimateTokens(text) <= budget) return { text, truncated: false }
  if (budget <= 0) return { text: '', truncated: true }
  const marker = '…（中间内容略）…'
  let low = 0
  let high = Math.ceil(text.length / 2)
  let best = ''
  while (low <= high) {
    const side = Math.floor((low + high) / 2)
    const candidate = side === 0 ? text.slice(0, 1) : `${text.slice(0, side)}${marker}${text.slice(-side)}`
    if (estimateTokens(candidate) <= budget) {
      best = candidate
      low = side + 1
    } else {
      high = side - 1
    }
  }
  return { text: best || text.slice(0, 1), truncated: true }
}

/** Keep the newest context intact unless it alone exceeds the available token budget. */
function compactByTokens(history: HistoryMessage[], maxTokens: number): CompactResult {
  const available = history.filter((item) => item.content !== '')
  const total = available.reduce((sum, item) => sum + historyMessageTokens(item), 0)
  if (total <= maxTokens) return { messages: available, dropped: 0 }

  const messages: HistoryMessage[] = []
  let used = 0
  let truncated = 0
  for (let index = available.length - 1; index >= 0; index--) {
    const item = available[index]
    const cost = historyMessageTokens(item)
    const remaining = maxTokens - used
    if (cost <= remaining) {
      messages.unshift(item)
      used += cost
      continue
    }
    if (remaining > 8) {
      if (typeof item.content === 'string') {
        const compacted = textWithinTokenBudget(item.content, remaining - 4)
        if (compacted.text !== '') {
          const next = { role: item.role, content: compacted.text }
          messages.unshift(next)
          if (compacted.truncated) truncated++
        }
      } else {
        const imageParts = item.content.filter((part) => part.type === 'image_url')
        const imageCost = imageParts.length * ESTIMATED_IMAGE_TOKENS + 4
        const textBudget = Math.max(0, remaining - imageCost)
        const textParts = item.content
          .filter((part): part is Extract<ChatContentPart, { type: 'text' }> => part.type === 'text')
          .map((part) => textWithinTokenBudget(part.text, textBudget))
          .filter((part) => part.text !== '')
        messages.unshift({
          role: item.role,
          content: [
            ...textParts.map((part) => ({ type: 'text' as const, text: part.text })),
            ...imageParts,
          ],
        })
        if (textParts.some((part) => part.truncated) || imageCost > remaining) truncated++
      }
    } else {
      truncated++
    }
    break
  }

  return {
    messages,
    dropped: Math.max(0, available.length - messages.length) + truncated,
  }
}

/**
 * 兼容旧调用方的条数 / 字数压缩；助手主流程会传 token 预算，预算充足就原样保留。
 * 不调用模型做摘要——那是另一笔钱和时间，对一个人的日记对话来说没必要。
 */
export function compactHistory(
  history: HistoryMessage[],
  options: CompactOptions = {},
): CompactResult {
  if (options.maxTokens !== undefined) {
    return compactByTokens(history, Math.max(0, options.maxTokens))
  }
  const maxMessages = options.maxMessages ?? 16
  const maxChars = options.maxChars ?? 900
  const maxLatestUserChars = options.maxLatestUserChars ?? 12_000
  const kept = history.filter((item) => item.content !== '').slice(-maxMessages)
  let latestUserIndex = -1
  for (let index = kept.length - 1; index >= 0; index--) {
    if (kept[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }

  const compactText = (text: string, limit: number, preserveTail: boolean) => {
    if (text.length <= limit) return text
    if (!preserveTail) return `${text.slice(0, limit)}…（后文略）`
    const marker = '…（中间内容略）…'
    const sideLength = Math.floor((limit - marker.length) / 2)
    return `${text.slice(0, sideLength)}${marker}${text.slice(-sideLength)}`
  }

  const messages = kept.map((item, index) => {
    const limit = index === latestUserIndex ? maxLatestUserChars : maxChars
    const preserveTail = index === latestUserIndex
    if (typeof item.content === 'string') {
      return {
        role: item.role,
        content: compactText(item.content, limit, preserveTail),
      }
    }
    return {
      role: item.role,
      content: item.content.map((part) =>
        part.type === 'text'
          ? { type: 'text' as const, text: compactText(part.text, limit, preserveTail) }
          : part,
      ),
    }
  })

  return { messages, dropped: Math.max(0, history.length - kept.length) }
}
