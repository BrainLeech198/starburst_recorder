/**
 * 日程提醒：到点的条目弹一条系统通知。
 *
 * 分两层，和称重提醒一致：
 *   - 桌面 / 网页版：应用打开时检查一次，之后每分钟查一次，到点弹一条通知（见 @/platform/notify）
 *   - 安卓：一次性与重复任务都由原生层逐次排程，截止日后停止
 *
 * 每天每条只提醒一次（localStorage 里按「日期 + id」记），免得开一次弹一次。
 */
import type { ScheduleItem } from '@/core/db/schema'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { todayKey } from '@/core/utils/dateKey'
import { translate } from '@/shared/i18n/context'
import { notifyNow } from '@/platform/notify'
import { desktopBridge } from '@/platform/desktop'
import { dueOn, isRemindableLater, occursOn } from './scheduleMath'

const NOTIFIED_KEY = 'starburst.scheduleNotified'
const inFlight = new Set<string>()

/** 本地通知占用的 id 段；重排时先把这个段整体取消 */
const BASE_ID = 78000
const MAX_NOTIFICATIONS = 40
const pendingNotices = new Set<string>()

interface NativeScheduleReminderPlugin {
  sync(options: {
    title: string
    items: Pick<ScheduleItem, 'id' | 'dateKey' | 'endDate' | 'time' | 'title' | 'repeat' | 'weeklyDays' | 'monthlyDays' | 'yearlyDates'>[]
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
export async function maybeNotifySchedules(items: ScheduleItem[]): Promise<void> {
  const today = todayKey()
  const due = dueOn(items, today, currentClock())
  if (due.length === 0) return

  const state = readNotified(today)
  const fresh = due.filter((item) => !state.ids.includes(item.id) && !inFlight.has(item.id))
  if (fresh.length === 0) return

  const pendingKey = `${today}:${fresh.map((item) => item.id).sort().join(',')}`
  if (pendingNotices.has(pendingKey)) return
  pendingNotices.add(pendingKey)
  fresh.forEach((item) => inFlight.add(item.id))
  try {
    const delivered = await notifyNow(translate('schedule.notifyTitle'), bodyOf(fresh), { requestPermission: false })
    if (delivered) {
      const latest = readNotified(today)
      writeNotified({ date: today, ids: [...new Set([...latest.ids, ...fresh.map((item) => item.id)])] })
    }
  } finally {
    pendingNotices.delete(pendingKey)
    fresh.forEach((item) => inFlight.delete(item.id))
  }
}

/** 必须在用户点击「到点提醒我」时调用，不能等到提醒触发时再申请权限。 */
export async function requestScheduleReminderPermission(): Promise<boolean> {
  try {
    if (desktopBridge()?.isDesktop === true) return true
    if (Capacitor.isNativePlatform()) {
      const current = await LocalNotifications.checkPermissions()
      if (current.display === 'granted') return true
      const requested = await LocalNotifications.requestPermissions()
      return requested.display === 'granted'
    }
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/**
 * 安卓：一次性和重复任务都由原生层逐次排下一条提醒。
 * 桌面 / 浏览器没有这个插件，这里直接不动。
 */
export async function syncScheduleReminders(items: ScheduleItem[]): Promise<void> {
  let isAndroid = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    isAndroid = Capacitor.getPlatform() === 'android'
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') return

    // 先把这个 id 段整体取消，再按当前设置重排：删掉的任务不会留下旧通知
    await LocalNotifications.cancel({
      notifications: Array.from({ length: MAX_NOTIFICATIONS }, (_, index) => ({
        id: BASE_ID + index,
      })),
    })

    if (permission.display !== 'granted') {
      if (isAndroid) {
        await NativeScheduleReminder.sync({ title: translate('schedule.notifyTitle'), items: [] })
      }
      return
    }

    const today = todayKey()
    const title = translate('schedule.notifyTitle')
    const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = []
    let nextId = BASE_ID

    for (const item of items) {
      if (!item.remind || item.deletedAt !== null) continue
      if (notifications.length >= MAX_NOTIFICATIONS) break
      // Android 的 AlarmManager 接管所有日程，远期一次性日程也不会漏排。
      if (isAndroid) continue
      if (!isRemindableLater(item, today)) continue

      // 用具体发生日期排一次性通知，保证开始 / 截止日期和每周、每月、每年多选规则都生效。
      // iOS 的本地通知最多预排 40 次；应用再次打开时会滚动补排，Android 由原生闹钟逐次续排。
      const searchStart = item.dateKey > today ? item.dateKey : today
      const daysToSearch = item.repeat === 'yearly' ? 1465 : 366
      let candidate = searchStart
      for (let offset = 0; offset < daysToSearch && notifications.length < MAX_NOTIFICATIONS; offset += 1) {
        if (item.endDate && candidate > item.endDate) break
        if (occursOn(item, candidate)) {
          const at = new Date(`${candidate}T${item.time || '09:00'}:00`)
          if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now()) {
            notifications.push({ id: nextId++, title, body: item.title, schedule: { at } })
          }
        }
        const [year, month, day] = candidate.split('-').map(Number)
        const next = new Date(year, month - 1, day + 1)
        candidate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
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
          .filter((item) => item.remind && item.deletedAt === null)
          .slice(0, MAX_NOTIFICATIONS)
          .map(({ id, dateKey, endDate, time, title: itemTitle, repeat, weeklyDays, monthlyDays, yearlyDates }) => ({
            id,
            dateKey,
            endDate: endDate ?? null,
            time,
            title: itemTitle,
            repeat,
            weeklyDays,
            monthlyDays,
            yearlyDates,
          })),
      })
    } catch {
      // 原生排程器不可用时，日程本身仍可在应用内查看与打卡。
    }
  }
}
