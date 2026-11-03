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

/** Worker 地址。网页版与安卓用构建期注入的变量，桌面端走主进程也要用到它 */
const API = ((import.meta.env.VITE_PUSH_API as string | undefined) ?? '').replace(/\/+$/, '')

/** 一条公告 */
export interface Notice {
  id: string
  title: string
  body: string
  /** info 是普通通知；urgent 是要立刻处理的那种（比如「请删除旧的 API Key」） */
  level: 'info' | 'urgent'
  createdAt: number
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

/**
 * 发一条请求。
 *
 * 桌面端走主进程（避开 CORS），其余直接 fetch。
 * 拿不到结果时返回失败而不是抛异常——公告拉不到就当没有公告，
 * 不该让整个应用因为一个公告接口挂掉。
 */
async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<ChannelResult<T>> {
  const desktop = desktopBridge()
  if (desktop?.channel) {
    const response = await desktop.channel.request({
      url: `${API}${path}`,
      method: init.method,
      body: init.body,
    })
    if (!response.ok) {
      return { ok: false, error: response.error || `http ${response.status}` }
    }
    const parsed = await parseJson<T>(response.body)
    return parsed === null ? { ok: false, error: 'bad response' } : { ok: true, data: parsed }
  }

  if (!API) return { ok: false, error: 'not configured' }
  try {
    const response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json' },
      ...(init.method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { ok: false, error: `http ${response.status}` }
    const parsed = await parseJson<T>(await response.text())
    return parsed === null ? { ok: false, error: 'bad response' } : { ok: true, data: parsed }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 拉公告列表，新的在前。
 *
 * 拿不到就返回空列表：公告是加分项，不是应用能不能用的前提。
 */
export async function fetchNotices(): Promise<Notice[]> {
  const result = await request<{ notices?: Notice[] }>('/notices')
  if (!result.ok || !result.data) return []
  const list = Array.isArray(result.data.notices) ? result.data.notices : []
  return list.filter((item) => item && typeof item.title === 'string' && typeof item.body === 'string')
}

/** 订阅邮箱。只用于收公告，随时可以退订 */
export async function subscribeEmail(email: string): Promise<boolean> {
  const result = await request<{ ok?: boolean }>('/subscribe-email', {
    method: 'POST',
    body: { email },
  })
  return result.ok === true
}

/** 退订 */
export async function unsubscribeEmail(email: string): Promise<boolean> {
  const result = await request<{ ok?: boolean }>('/unsubscribe-email', {
    method: 'POST',
    body: { email },
  })
  return result.ok === true
}

/** 这个地址是不是已订阅 */
export async function checkSubscription(email: string): Promise<boolean> {
  const result = await request<{ subscribed?: boolean }>(
    `/subscription?email=${encodeURIComponent(email)}`,
  )
  return result.ok === true && result.data?.subscribed === true
}

/** 提交给官方的反馈 */
export async function submitFeedback(body: string): Promise<boolean> {
  const result = await request<{ ok?: boolean }>('/feedback', {
    method: 'POST',
    body: { body },
  })
  return result.ok === true
}

/**
 * 通道是否可用。
 *
 * 没配 `VITE_PUSH_API` 时整个功能不显示——宁可没有入口，
 * 也不要摆一个点了没反应的按钮（与 Web Push 同一个口径）。
 */
export function channelConfigured(): boolean {
  return Boolean(API)
}
