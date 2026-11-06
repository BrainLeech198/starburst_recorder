/**
 * 「官方频道」客户端：公告、邮箱订阅、用户反馈。
 *
 * 三端（网页 / PWA、安卓、Windows 桌面）走的是**同一套接口**，
 * 差别只在怎么把请求送出去：
 *
 * - 网页版：直接 `fetch`。Worker 那边按 Origin 放行。
 * - 安卓壳：页面在 `https://localhost`，同样是 `fetch`，但 Worker 的
 *   `ALLOWED_ORIGINS` 必须包含这个源，否则预检就被挡了。
 * - 桌面壳：页面是 `file://`，直连会被 CORS 挡，所以交给主进程代取
 *   （见 `electron/main.cjs` 的 `channel:request`）。
 *
 * **推送是另一条线**：Web Push 只有浏览器有，安卓与 Windows 的安装包用户
 * 收不到任何推送。所以「紧急公告」不能只靠推送——这个模块就是他们的通道。
 */

/**
 * 公开频道固定走 Pages 同域入口，避开客户端直连 workers.dev 的网络限制。
 * VITE_CHANNEL_API 仅用于本地 / 自托管部署；Web Push 仍单独使用 VITE_PUSH_API。
 */
const DEFAULT_CHANNEL_API = 'https://starburst-recorder.pages.dev/channel'
const API = (
  (import.meta.env.VITE_CHANNEL_API as string | undefined)?.trim() || DEFAULT_CHANNEL_API
).replace(/\/+$/, '')

/** 一条公告 */
export interface Notice {
  id: string
  title: string
  body: string
  /** info 是普通通知；urgent 是要立刻处理的那种（比如「请删除旧的 API Key」） */
  level: 'info' | 'urgent'
  createdAt: number
}

export type FeedbackStatus = 'received' | 'in_progress' | 'resolved'

export interface FeedbackRecord {
  id: string
  body: string
  createdAt: number
  status: FeedbackStatus
  developerReply: string
  statusUpdatedAt?: number
  developerRepliedAt?: number
}

/** 统一的结果信封：失败时用 error 说明原因，不抛异常 */
export interface ChannelResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** 桌面壳的能力。浏览器与安卓里是 undefined */
function desktopBridge() {
  return (typeof window !== 'undefined' ? window.desktop : undefined) ?? undefined
}

async function parseJson<T>(text: string): Promise<T | null> {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const FEEDBACK_CLIENT_ID_KEY = 'starburst.feedbackClientId'
let temporaryFeedbackClientId: string | undefined

/** Stable per-installation ID. The server hashes it before storage. */
function feedbackClientId(): string | null {
  try {
    const stored = window.localStorage.getItem(FEEDBACK_CLIENT_ID_KEY)
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored
    }
    const generated = globalThis.crypto?.randomUUID?.()
    if (!generated) return null
    window.localStorage.setItem(FEEDBACK_CLIENT_ID_KEY, generated)
    return generated
  } catch {
    // Keep feedback usable for the current session if browser storage is blocked.
    temporaryFeedbackClientId ??= globalThis.crypto?.randomUUID?.()
    return temporaryFeedbackClientId ?? null
  }
}

/**
 * 发一条请求。
 *
 * 桌面端走主进程（避开 CORS），其余直接 fetch。
 * 拿不到结果时返回失败而不是抛异常。公告接口不可用不影响应用主体，
 * 但调用方必须区分“加载失败”和“成功但列表为空”。
 */
async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<ChannelResult<T>> {
  if (!API) return { ok: false, error: 'not configured' }
  try {
    const desktop = desktopBridge()
    if (desktop?.channel) {
      const response = await desktop.channel.request({
        url: `${API}${path}`,
        method: init.method,
        body: init.body,
      })
      if (!response.ok) {
        const body = await parseJson<{ error?: unknown }>(response.body)
        return {
          ok: false,
          error:
            (typeof body?.error === 'string' && body.error) ||
            response.error ||
            `http ${response.status}`,
        }
      }
      const parsed = await parseJson<T>(response.body)
      return parsed === null ? { ok: false, error: 'bad response' } : { ok: true, data: parsed }
    }

    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${API}${path}`, {
        method: init.method,
        ...(init.method === 'POST' ? { headers: { 'Content-Type': 'application/json' } } : {}),
        ...(init.method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}),
        signal: controller.signal,
      })
      const text = await response.text()
      const parsed = await parseJson<T>(text)
      if (!response.ok) {
        const body = await parseJson<{ error?: unknown }>(text)
        return {
          ok: false,
          error: (typeof body?.error === 'string' && body.error) || `http ${response.status}`,
        }
      }
      return parsed === null ? { ok: false, error: 'bad response' } : { ok: true, data: parsed }
    } finally {
      globalThis.clearTimeout(timeout)
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 拉公告列表，新的在前。
 *
 * 成功但没有公告时返回 `{ ok: true, data: [] }`；网络或服务错误保留在 `error`，
 * 这样界面不会把故障误报成“暂无公告”。
 */
export async function fetchNotices(): Promise<ChannelResult<Notice[]>> {
  const result = await request<{ notices?: unknown }>('/notices')
  if (!result.ok) return { ok: false, error: result.error }
  const raw = result.data?.notices
  if (!Array.isArray(raw)) return { ok: false, error: 'bad response' }

  const notices = raw.filter(
    (item): item is Notice =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as Notice).id === 'string' &&
      typeof (item as Notice).title === 'string' &&
      typeof (item as Notice).body === 'string' &&
      ((item as Notice).level === 'info' || (item as Notice).level === 'urgent'),
  )
  if (raw.length > 0 && notices.length === 0) return { ok: false, error: 'bad response' }
  return { ok: true, data: notices }
}

/** 订阅邮箱。只用于收公告，随时可以退订 */
export async function subscribeEmail(
  email: string,
): Promise<ChannelResult<{ ok?: boolean; confirmationRequired?: boolean }>> {
  const result = await request<{ ok?: boolean }>('/subscribe-email', {
    method: 'POST',
    body: { email },
  })
  if (!result.ok) return result
  return result.data?.ok === true ? result : { ok: false, error: 'bad response' }
}

/** 退订 */
export async function unsubscribeEmail(email: string): Promise<ChannelResult<{ ok?: boolean }>> {
  const result = await request<{ ok?: boolean }>('/unsubscribe-email', {
    method: 'POST',
    body: { email },
  })
  if (!result.ok) return result
  return result.data?.ok === true ? result : { ok: false, error: 'bad response' }
}

/** 这个地址是不是已订阅 */
export async function checkSubscription(email: string): Promise<ChannelResult<boolean>> {
  const result = await request<{ subscribed?: unknown }>(
    `/subscription?email=${encodeURIComponent(email)}`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  if (typeof result.data?.subscribed !== 'boolean') return { ok: false, error: 'bad response' }
  return { ok: true, data: result.data.subscribed }
}

/** 提交给官方的反馈 */
export async function submitFeedback(body: string): Promise<ChannelResult<{ ok?: boolean }>> {
  const clientId = feedbackClientId()
  if (!clientId) return { ok: false, error: 'feedback client id unavailable' }
  const result = await request<{ ok?: boolean }>('/feedback', {
    method: 'POST',
    body: { body, clientId },
  })
  if (!result.ok) return result
  return result.data?.ok === true ? result : { ok: false, error: 'bad response' }
}

/** Read feedback history for this installation only. */
export async function fetchFeedbackHistory(): Promise<ChannelResult<FeedbackRecord[]>> {
  const clientId = feedbackClientId()
  if (!clientId) return { ok: false, error: 'feedback client id unavailable' }
  const result = await request<{ feedback?: unknown }>('/feedback/history', {
    method: 'POST',
    body: { clientId },
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (!Array.isArray(result.data?.feedback)) return { ok: false, error: 'bad response' }
  const feedback = result.data.feedback.filter(
    (item): item is FeedbackRecord =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as FeedbackRecord).id === 'string' &&
      typeof (item as FeedbackRecord).body === 'string' &&
      Number.isFinite((item as FeedbackRecord).createdAt) &&
      ['received', 'in_progress', 'resolved'].includes((item as FeedbackRecord).status) &&
      typeof (item as FeedbackRecord).developerReply === 'string',
  )
  if (result.data.feedback.length > 0 && feedback.length === 0) {
    return { ok: false, error: 'bad response' }
  }
  return { ok: true, data: feedback }
}

/**
 * 通道是否可用。
 *
 * 官方 Pages 代理固定可用；自托管部署可用 `VITE_CHANNEL_API` 覆盖地址。
 */
export function channelConfigured(): boolean {
  return Boolean(API)
}
