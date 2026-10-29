/**
 * 称重日的「系统通知」：和应用内横幅（WeighInCard 的提示条）互补。
 *
 * - 桌面 / 浏览器：走 Web Notification（Electron 渲染进程原生支持），打开应用后到点弹一次
 * - 安卓：走 @capacitor/local-notifications，按「每周 + 时刻」排一条系统通知，
 *   应用没开着也会弹；改设置就重排，删设置就取消
 *
 * 每天最多提醒一次（localStorage 记到今天的日期），免得开一次弹一次。
 */
import { translate } from '@/shared/i18n/context'
import { isWeighDay, weekdayOf } from './healthMath'
import { todayKey } from '@/core/utils/dateKey'
import type { HealthProfile } from '@/core/db/schema'

/** 安卓本地通知的固定 id；桌面不用 */
const WEIGH_NOTIFICATION_ID = 77120
const NOTIFIED_KEY = 'starburst.weighNotified'

function weighTitle() {
  return translate('health.weighTitle')
}
function weighBody() {
  return translate('health.weighToday')
}

function hourMinute(weighTime: string): { hour: number; minute: number } {
  const matched = weighTime.match(/^(\d{1,2}):(\d{2})$/)
  if (!matched) return { hour: 7, minute: 0 }
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return { hour: 7, minute: 0 }
  return { hour: Math.min(23, hour), minute: Math.min(59, minute) }
}

/** 已经记过今天这次称重就不用再催 */
function weighedToday(profile: HealthProfile | undefined): boolean {
  const today = todayKey()
  return (profile?.weighIns ?? []).some((item) => item.dateKey === today)
}

/**
 * 桌面 / 浏览器：今天是称重日、过了提醒时刻、还没称也没提醒过 → 弹一条系统通知。
 * 健康页打开时查一次，之后每分钟查一次（都是便宜的本地判断）。
 */
export function maybeNotifyWeighDay(profile: HealthProfile | undefined): void {
  if (!profile || !profile.weighDay) return
  const today = todayKey()
  if (!isWeighDay(today, profile.weighDay)) return
  if (weighedToday(profile)) return
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === today) return
    const now = new Date()
    const { hour, minute } = hourMinute(profile.weighTime)
    if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return
    if (typeof Notification === 'undefined') return
    const fire = () => new Notification(weighTitle(), { body: weighBody() })
    if (Notification.permission === 'granted') {
      fire()
    } else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((permission) => {
        if (permission === 'granted') fire()
      })
    }
    localStorage.setItem(NOTIFIED_KEY, today)
  } catch {
    // 隐私模式存不了提醒标记：大不了明天再提醒一次
  }
}

/**
 * 安卓：按「每周 + 时刻」排一条系统通知。设了就重排，取消设置就删掉。
 * 桌面 / 浏览器没有这个插件，这里直接不动。
 */
export async function syncWeighReminder(profile: HealthProfile | undefined): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.requestPermissions()
    if (!profile?.weighDay) {
      await LocalNotifications.cancel({ notifications: [{ id: WEIGH_NOTIFICATION_ID }] })
      return
    }
    const { hour, minute } = hourMinute(profile.weighTime)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: WEIGH_NOTIFICATION_ID,
          title: weighTitle(),
          body: weighBody(),
          // 插件的 weekday 是 1=周日；我们的 weighDay 是 1=周一，取个模换算
          schedule: { every: 'week', on: { weekday: (profile.weighDay % 7) + 1, hour, minute } },
        },
      ],
    })
  } catch {
    // 插件不可用（没装、模拟器不支持）就静默：应用内横幅还在
  }
}

/** 本地通知权限文案在设置里提一嘴用 */
export function isNativePlatform(): boolean {
  try {
    return typeof window !== 'undefined' && 'Capacitor' in window
  } catch {
    return false
  }
}

/** 给测试和调用方看的：今天提醒过没有 */
export function weekdayOfKey(dateKey: string): number | null {
  return weekdayOf(dateKey)
}
