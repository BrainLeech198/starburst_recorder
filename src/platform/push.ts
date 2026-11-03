/**
 * Web Push：让「应用关着也能提醒」在网页版 / PWA 上成立。
 *
 * 三步必须按顺序发生，顺序错了 iOS 会直接拒绝：
 *   1. 权限申请（`Notification.requestPermission`）——必须由用户手势触发；
 *   2. `pushManager.subscribe`——需要 VAPID 公钥；
 *   3. 把订阅和「只有时间的提醒清单」发给自己的转发服务。
 *
 * 配置从环境变量来：`VITE_PUSH_API` 与 `VITE_VAPID_PUBLIC_KEY`。两个都不配时整块功能
 * 视为不可用——设置页会说明原因，而不是摆一个点了没反应的按钮。
 *
 * 这里刻意只定义「时间 + 类别」的数据形状，不放任何用户内容：服务端要能在应用关着时
 * 推送，就必须知道几点推；但它不需要知道推的是什么。文案由客户端订阅时给一份通用版本。
 */
import { isIosWebApp, isStandalone, isWebApp } from './pwa'

export type ReminderCategory = 'weigh' | 'training' | 'schedule'

/** 一条提醒位：要么每周重复（weekdays），要么一次性（date），二选一 */
export interface ReminderSlot {
  /** 稳定 id：同一条提醒改了时间也算同一条，服务端据此去重 */
  id: string
  category: ReminderCategory
  /** 本地时间 `HH:MM` */
  time: string
  /** 每周几，0=周日 … 6=周六 */
  weekdays?: number[]
  /** 一次性提醒的本地日期 `YYYY-MM-DD` */
  date?: string
}

/** 推送文案：服务端不认语言，订阅时由客户端把当前语言的通用文案一起交过去 */
export interface PushCopy {
  title: string
  body: string
}

export type PushState =
  /** 桌面壳 / 安卓壳 / 浏览器不支持：这块功能不显示 */
  | 'unsupported'
  /** 代码支持，但没配 VITE_PUSH_API / VITE_VAPID_PUBLIC_KEY */
  | 'unconfigured'
  /** iOS 上必须先「添加到主屏幕」 */
  | 'needs-install'
  /** 用户把通知权限拒了，只能在系统设置里改 */
  | 'denied'
  | 'off'
  | 'on'

const API = ((import.meta.env.VITE_PUSH_API as string | undefined) ?? '').replace(/\/+$/, '')
const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''
/**
 * 与中继共享的令牌。它会被打进网页产物、谁都能扒出来——**挡的是无差别扫描，不是定向攻击**。
 * 没有它，任何人 `curl` 一下就能往 KV 里刷注册，把每天 1000 次的写额度打满，
 * 结果是当天的提醒全部静默。见 worker/push/src/index.js 的 tokenRejected。
 */
const TOKEN = (import.meta.env.VITE_PUSH_TOKEN as string | undefined) ?? ''
/** 上次成功上传的指纹：清单没变就不重复发请求 */
const SYNC_KEY = 'starburst.pushSynced'

export function pushSupported(): boolean {
  if (!isWebApp()) return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** 能不能开、为什么不能开 */
export function pushState(subscribed: boolean): PushState {
  if (!pushSupported()) return 'unsupported'
  if (!API || !VAPID) return 'unconfigured'
  // iOS 只允许「已添加到主屏幕」的网页应用推送，Safari 标签页里永远拿不到订阅
  if (isIosWebApp() && !isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  return subscribed ? 'on' : 'off'
}

/**
 * VAPID 公钥是 base64url，`applicationServerKey` 只认字节。
 *
 * 返回类型写死成 `Uint8Array<ArrayBuffer>`：`applicationServerKey` 要的是
 * `BufferSource`，而 `BufferSource` 不接受 `SharedArrayBuffer` 支撑的视图。
 * 不显式给一块 `ArrayBuffer`，TS 会推成 `ArrayBufferLike` 然后拒绝赋值。
 */
function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function existingSubscription(): Promise<PushSubscription | null> {
  try {
    if (!pushSupported()) return null
    const registration = await navigator.serviceWorker.getRegistration()
    return (await registration?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/** 中继要的两个头：JSON 与共享令牌（没配令牌就不带，本地调试用） */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (TOKEN) headers['x-push-token'] = TOKEN
  return headers
}

async function upload(
  subscription: PushSubscription,
  slots: ReminderSlot[],
  copy: Record<ReminderCategory, PushCopy>,
): Promise<boolean> {
  try {
    const response = await fetch(`${API}/subscribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        // 服务端按这个时区判断「现在是不是到了 HH:MM」
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        slots,
        copy,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 开启推送。**必须从点击事件里直接调用**——iOS 只在用户手势的同一轮里认权限申请，
 * 中间夹一个 await 就可能直接给 denied。所以 `requestPermission` 放在第一个 await 位置。
 */
export async function enablePush(
  slots: ReminderSlot[],
  copy: Record<ReminderCategory, PushCopy>,
): Promise<boolean> {
  if (!pushSupported() || !API || !VAPID) return false
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(VAPID),
      }))

    const ok = await upload(subscription, slots, copy)
    if (ok) rememberFingerprint(slots, copy)
    return ok
  } catch {
    return false
  }
}

/** 关闭推送：先告诉服务端删订阅，再在本机取消——顺序反了服务端会一直往死地址推 */
export async function disablePush(): Promise<void> {
  const subscription = await existingSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  try {
    await fetch(`${API}/unsubscribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint }),
    })
  } catch {
    // 服务端没删成也要把本机订阅退掉，否则用户点了「关闭」却还在收推送
  }
  try {
    await subscription.unsubscribe()
  } catch {
    // 已经失效的订阅退不掉，忽略
  }
  try {
    localStorage.removeItem(SYNC_KEY)
  } catch {
    // 隐私模式
  }
}

function rememberFingerprint(
  slots: ReminderSlot[],
  copy: Record<ReminderCategory, PushCopy>,
): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ slots, copy }))
  } catch {
    // 隐私模式存不了：下次打开会多重传一次，不影响结果
  }
}

function unchanged(slots: ReminderSlot[], copy: Record<ReminderCategory, PushCopy>): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) === JSON.stringify({ slots, copy })
  } catch {
    return false
  }
}

/**
 * 把最新的提醒清单同步上去。没订阅过就什么都不做——
 * 用户没主动开启，我们不该替他申请权限。
 */
export async function syncPushSlots(
  slots: ReminderSlot[],
  copy: Record<ReminderCategory, PushCopy>,
): Promise<void> {
  if (!pushSupported() || !API || !VAPID) return
  if (unchanged(slots, copy)) return
  const subscription = await existingSubscription()
  if (!subscription) return
  if (await upload(subscription, slots, copy)) rememberFingerprint(slots, copy)
}
