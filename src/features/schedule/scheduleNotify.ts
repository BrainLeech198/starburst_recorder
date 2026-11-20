/**
 * 日程提醒：到点的条目弹一条系统通知。
 *
 * 分两层，和称重提醒一致：
 *   - 桌面 / 网页版：应用打开时检查一次，之后每分钟查一次，到点弹一条通知（见 @/platform/notify）
 *   - 安卓：一次性走 Capacitor；重复任务由原生层逐次重排，截止日后停止
 *
 * 每天每条只提醒一次（localStorage 里按「日期 + id」记），免得开一次弹一次。
 */
import type { ScheduleItem } from '@/core/db/schema'
import { registerPlugin } from '@capacitor/core'
import { todayKey } from '@/core/utils/dateKey'
import { translate } from '@/shared/i18n/context'
import { notifyNow } from '@/platform/notify'
import { dueOn, isRemindableLater } from './scheduleMath'

const NOTIFIED_KEY = 'starburst.scheduleNotified'
const inFlight = new Set<string>()

/** 安卓本地通知占用的 id 段；重排时先把这个段整体取消 */
const BASE_ID = 78000
const MAX_NOTIFICATIONS = 40

interface NativeScheduleReminderPlugin {
  sync(options: {
    title: string
    items: Pick<ScheduleItem, 'id' | 'dateKey' | 'endDate' | 'time' | 'title' | 'repeat' | 'weeklyDays'>[]
  }): Promise<void>
}

const NativeScheduleReminder = registerPlugin<NativeScheduleReminderPlugin>('ScheduleReminder')

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
  const fresh = due.filter((item) => !state.ids.includes(item.id) && !inFlight.has(item.id))
  if (fresh.length === 0) return

  fresh.forEach((item) => inFlight.add(item.id))
  void notifyNow(translate('schedule.notifyTitle'), bodyOf(fresh))
    .then((delivered) => {
      if (!delivered) return
      const latest = readNotified(today)
      writeNotified({ date: today, ids: [...new Set([...latest.ids, ...fresh.map((item) => item.id)])] })
    })
    .finally(() => fresh.forEach((item) => inFlight.delete(item.id)))
}

function hourMinute(time: string): { hour: number; minute: number } | null {
  const matched = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!matched) return null
  return { hour: Number(matched[1]), minute: Number(matched[2]) }
}

/**
 * 安卓：重复任务由原生层逐次排下一条提醒；一次性日程排到具体时刻。
 * 桌面 / 浏览器没有这个插件，这里直接不动。
 */
export async function syncScheduleReminders(items: ScheduleItem[]): Promise<void> {
  let isAndroid = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    isAndroid = Capacitor.getPlatform() === 'android'
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') return

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
        if (isAndroid) continue
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
        if (isAndroid) continue
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

  if (isAndroid) {
    try {
      const title = translate('schedule.notifyTitle')
      await NativeScheduleReminder.sync({
        title,
        items: items
          .filter((item) => item.remind && item.deletedAt === null && item.repeat !== 'none')
          .slice(0, MAX_NOTIFICATIONS)
          .map(({ id, dateKey, endDate, time, title: itemTitle, repeat, weeklyDays }) => ({
            id,
            dateKey,
            endDate: endDate ?? null,
            time,
            title: itemTitle,
            repeat,
            weeklyDays,
          })),
      })
    } catch {
      // 原生排程器不可用时，日程本身仍可在应用内查看与打卡。
    }
  }
}
