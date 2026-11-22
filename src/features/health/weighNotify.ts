/**
 * 称重日的「系统通知」：和应用内横幅（WeighInCard 的提示条）互补。
 *
 * - 桌面 / 网页版：走 notifyNow（桌面用 Notification 构造器，网页版与 PWA 走 Service Worker
 *   的 showNotification——iOS 上 `new Notification()` 会抛错），打开应用后到点弹一次
 * - 安卓：走 @capacitor/local-notifications，按「每周 + 时刻」排一条系统通知，
 *   应用没开着也会弹；改设置就重排，删设置就取消
 *
 * 每天最多提醒一次（localStorage 记到今天的日期），免得开一次弹一次。
 */
import { translate } from '@/shared/i18n/context'
import { Capacitor } from '@capacitor/core'
import { notifyNow, requestNotificationPermission } from '@/platform/notify'
import { isWeighDay } from './healthMath'
import { weighNotificationSchedule } from './weighReminderMath'
import { todayKey } from '@/core/utils/dateKey'
import type { HealthProfile } from '@/core/db/schema'

/** 安卓本地通知的固定 id；桌面不用 */
const WEIGH_NOTIFICATION_ID = 77120
const NOTIFIED_KEY = 'starburst.weighNotified'
let notificationInFlight = false

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
  } catch {
    // 隐私模式存不了提醒标记：仍尝试发送通知
  }
  if (notificationInFlight) return
  const now = new Date()
  const { hour, minute } = hourMinute(profile.weighTime)
  if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return
  notificationInFlight = true
  void notifyNow(weighTitle(), weighBody())
    .then((delivered) => {
      if (!delivered) return
      try {
        localStorage.setItem(NOTIFIED_KEY, today)
      } catch {
        // 隐私模式下无法记录；页面再次检查时可能重复一次
      }
    })
    .finally(() => {
      notificationInFlight = false
    })
}

export type WeighReminderPermission = 'granted' | 'denied' | 'failed'
export type WeighReminderSyncResult =
  | 'not-native'
  | 'pending'
  | 'cancelled'
  | 'permission-denied'
  | 'scheduled'
  | 'scheduled-inexact'
  | 'failed'

type WeighReminderSettings = Pick<HealthProfile, 'weighDay' | 'weighTime'>
let syncQueue: Promise<void> = Promise.resolve()

/** 用户点选称重日 / 时间时调用，确保权限请求发生在明确的用户操作中。 */
export async function requestWeighReminderPermission(): Promise<WeighReminderPermission> {
  try {
    if (!Capacitor.isNativePlatform()) {
      return (await requestNotificationPermission()) ? 'granted' : 'denied'
    }

    const { LocalNotifications } = await import('@capacitor/local-notifications')
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
    return permission.display === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'failed'
  }
}

/**
 * 安卓：按「每周 + 时刻」排一条系统通知。权限检查、取消旧项、排程结果都明确返回，
 * 供页面提示用户；应用壳会在启动、档案设置变化和从系统设置返回时自动调用。
 */
export function syncWeighReminder(
  settings: WeighReminderSettings | null | undefined,
  options: { requestExactAlarm?: boolean } = {},
): Promise<WeighReminderSyncResult> {
  const pending = syncQueue.then(
    () => performWeighReminderSync(settings, options),
    () => performWeighReminderSync(settings, options),
  )
  syncQueue = pending.then(() => undefined, () => undefined)
  return pending
}

async function performWeighReminderSync(
  settings: WeighReminderSettings | null | undefined,
  options: { requestExactAlarm?: boolean },
): Promise<WeighReminderSyncResult> {
  try {
    if (!Capacitor.isNativePlatform()) return 'not-native'
    if (settings === undefined) return 'pending'

    const { LocalNotifications } = await import('@capacitor/local-notifications')
    // 先取消旧排程，避免权限关闭或新排程失败时仍在旧时间响。
    await LocalNotifications.cancel({ notifications: [{ id: WEIGH_NOTIFICATION_ID }] })
    if (!settings?.weighDay) return 'cancelled'

    const permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') return 'permission-denied'

    const schedule = weighNotificationSchedule(settings.weighDay, settings.weighTime)
    if (!schedule) return 'failed'
    let isExactNotification: boolean | undefined
    if (Capacitor.getPlatform() === 'android') {
      let exactPermission = await LocalNotifications.checkExactNotificationSetting()
      if (exactPermission.exact_alarm !== 'granted' && options.requestExactAlarm) {
        exactPermission = await LocalNotifications.changeExactNotificationSetting()
      }
      // 启动时不擅自打开系统设置；精确闹钟不可用时仍排一个可送达的非精确提醒。
      isExactNotification = exactPermission.exact_alarm === 'granted'
    }

    const result = await LocalNotifications.schedule({
      notifications: [
        {
          id: WEIGH_NOTIFICATION_ID,
          title: weighTitle(),
          body: weighBody(),
          schedule,
          ...(isExactNotification === undefined ? {} : { isExactNotification }),
        },
      ],
    })
    return result.warning || isExactNotification === false ? 'scheduled-inexact' : 'scheduled'
  } catch {
    return 'failed'
  }
}

