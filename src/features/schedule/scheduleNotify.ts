/**
 * 日程提醒：到点的条目弹一条系统通知。
 *
 * 分两层，和称重提醒一致：
 *   - 桌面 / 浏览器：应用打开时检查一次，之后每分钟查一次，到点弹 Web Notification
 *   - 安卓：走 @capacitor/local-notifications 预排通知，应用没开着也会弹
 *
 * 每天每条只提醒一次（localStorage 里按「日期 + id」记），免得开一次弹一次。
 */
import type { ScheduleItem } from '@/core/db/schema'
import { todayKey } from '@/core/utils/dateKey'
import { translate } from '@/shared/i18n/context'
import { dueOn, isRemindableLater } from './scheduleMath'

const NOTIFIED_KEY = 'starburst.scheduleNotified'

/** 安卓本地通知占用的 id 段；重排时先把这个段整体取消 */
const BASE_ID = 78000
const MAX_NOTIFICATIONS = 40

interface NotifiedState {
  date: string
  ids: string[]
}

function readNotified(today: string): NotifiedState {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY)
    if (!raw) return { date: today, ids: [] }
    const parsed = JSON.parse(raw) as NotifiedState
    if (parsed?.date !== today || !Array.isArray(parsed.ids)) return { date: today, ids: [] }
    return parsed
  } catch {
    return { date: today, ids: [] }
  }
}

function writeNotified(state: NotifiedState) {
  try {
    localStorage.setItem(
      NOTIFIED_KEY,
      JSON.stringify({ date: state.date, ids: state.ids.slice(-200) }),
    )
  } catch {
    // 隐私模式存不了：大不了下次再提醒一次
  }
}

function currentClock(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function bodyOf(items: ScheduleItem[]): string {
  const titles = items.slice(0, 3).map((item) => item.title)
  const more = items.length > 3 ? ' …' : ''
  return titles.join('、') + more
}

/**
 * 桌面 / 浏览器：今天到点、还没做、今天没提醒过的条目 → 合成一条通知。
 * 页面挂载时调一次，之后由宿主组件每分钟调一次。
 */
export function maybeNotifySchedules(items: ScheduleItem[]): void {
  const today = todayKey()
  const due = dueOn(items, today, currentClock())
  if (due.length === 0) return

  const state = readNotified(today)
  const fresh = due.filter((item) => !state.ids.includes(item.id))
  if (fresh.length === 0) return

  try {
    if (typeof Notification === 'undefined') return
    const fire = () =>
      new Notification(translate('schedule.notifyTitle'), { body: bodyOf(fresh) })
    if (Notification.permission === 'granted') {
      fire()
    } else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((permission) => {
        if (permission === 'granted') fire()
      })
    }
    writeNotified({ date: today, ids: [...state.ids, ...fresh.map((item) => item.id)] })
  } catch {
    // 通知不可用就静默：页面里的列表还在
  }
}

function hourMinute(time: string): { hour: number; minute: number } | null {
  const matched = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!matched) return null
  return { hour: Number(matched[1]), minute: Number(matched[2]) }
}

/**
 * 安卓：按「每天 / 每周」预排系统通知；一次性日程排到具体时刻。
 * 桌面 / 浏览器没有这个插件，这里直接不动。
 */
export async function syncScheduleReminders(items: ScheduleItem[]): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.requestPermissions()

    // 先把这个 id 段整体取消，再按当前设置重排：删掉的任务不会留下旧通知
    await LocalNotifications.cancel({
      notifications: Array.from({ length: MAX_NOTIFICATIONS }, (_, index) => ({
        id: BASE_ID + index,
      })),
    })

    const today = todayKey()
    const title = translate('schedule.notifyTitle')
    const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = []
    let nextId = BASE_ID

    for (const item of items) {
      if (!item.remind || item.deletedAt !== null) continue
      if (notifications.length >= MAX_NOTIFICATIONS) break
      const clock = hourMinute(item.time) ?? { hour: 9, minute: 0 }

      if (item.repeat === 'weekly') {
        for (const day of item.weeklyDays) {
          if (notifications.length >= MAX_NOTIFICATIONS) break
          notifications.push({
            id: nextId++,
            title,
            body: item.title,
            schedule: { every: 'week', on: { weekday: (day % 7) + 1, ...clock } },
          })
        }
      } else if (item.repeat === 'daily') {
        notifications.push({
          id: nextId++,
          title,
          body: item.title,
          schedule: { every: 'day', on: clock },
        })
      } else if (isRemindableLater(item, today)) {
        // 一次性日程只排最近 30 天，很久以后的事不占通知位
        const at = new Date(`${item.dateKey}T${item.time || '09:00'}:00`)
        if (Number.isNaN(at.getTime())) continue
        notifications.push({ id: nextId++, title, body: item.title, schedule: { at } })
      }
    }

    if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
  } catch {
    // 插件不可用（没装、模拟器不支持）就静默：应用内列表还在
  }
}
