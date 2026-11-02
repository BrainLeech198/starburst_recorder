/**
 * 日程 / 定期任务的纯计算：某天有没有、做没做、到没到点。
 *
 * 不碰存储也不碰通知：页面和提醒各自拿这里的结果去用，
 * 「周几命中」「昨天的勾不影响今天」这些规则才有单测兜着。
 */
import type { ScheduleItem } from '@/core/db/schema'

/** 某个月的日期键列表（含首尾），日历补位时用不到，只用来遍历当月 */
export function dateKeysOfMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number)
  const days = new Date(year, month, 0).getDate()
  return Array.from({ length: days }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)
}

/** JS 的 0=周日；这里统一成 1=周一 … 7=周日，和 TrainingPlan 一致 */
export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(year, month - 1, day).getDay()
  return value === 0 ? 7 : value
}

/** 这条日程在不在这一天发生：一次性只看当天，其余从起始日往后展开 */
export function occursOn(item: ScheduleItem, dateKey: string): boolean {
  if (item.deletedAt !== null) return false
  if (dateKey < item.dateKey) return false
  if (item.repeat === 'none') return dateKey === item.dateKey
  if (item.repeat === 'daily') return true
  return item.weeklyDays.includes(weekdayOf(dateKey))
}

/** 某一天的全部日程，按时刻排序；全天（空时刻）排在最前 */
export function occurrencesOn(items: ScheduleItem[], dateKey: string): ScheduleItem[] {
  return items
    .filter((item) => occursOn(item, dateKey))
    .sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.createdAt - b.createdAt)
}

/** 一天里各有多少条，日历上用来点一个小标记 */
export function countByDay(items: ScheduleItem[], dateKeys: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const dateKey of dateKeys) {
    const count = items.filter((item) => occursOn(item, dateKey)).length
    if (count > 0) counts.set(dateKey, count)
  }
  return counts
}

/** 这一天做完了没有：一次性看 doneAt，定期任务看 doneDays */
export function isDoneOn(item: ScheduleItem, dateKey: string): boolean {
  if (item.repeat === 'none') return item.doneAt !== null
  return item.doneDays.includes(dateKey)
}

/** 勾 / 取消勾之后的补丁；不直接改传进来的对象 */
export function donePatch(
  item: ScheduleItem,
  dateKey: string,
  done: boolean,
): Pick<ScheduleItem, 'doneAt' | 'doneDays'> {
  if (item.repeat === 'none') {
    return { doneAt: done ? Date.now() : null, doneDays: item.doneDays }
  }
  const days = new Set(item.doneDays)
  if (done) days.add(dateKey)
  else days.delete(dateKey)
  return {
    doneAt: item.doneAt,
    // 只留最近 400 天，长期用的任务不会越攒越长
    doneDays: [...days].sort().slice(-400),
  }
}

/** 到点没有：全天（空串）永远算「已经到了」，只在当天提醒时用 */
export function isTimeReached(time: string, clock: string): boolean {
  if (time === '') return true
  return clock >= time
}

/** 某一天该弹提醒的条目：提醒开着、到点、还没做完 */
export function dueOn(items: ScheduleItem[], dateKey: string, clock: string): ScheduleItem[] {
  return occurrencesOn(items, dateKey).filter(
    (item) => item.remind && isTimeReached(item.time, clock) && !isDoneOn(item, dateKey),
  )
}

/** 一次性日程的提醒只排给未来 30 天，避免给很久以后的事情也占通知位 */
export function isRemindableLater(item: ScheduleItem, today: string): boolean {
  if (!item.remind || item.deletedAt !== null) return false
  if (item.repeat !== 'none') return true
  const limit = shiftDayKey(today, 30)
  return item.dateKey >= today && item.dateKey <= limit
}

function shiftDayKey(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}
