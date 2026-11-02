/**
 * 周视图的纯计算：以周一为一周的开始。
 *
 * 月历是「记录深浅」，周视图是「这一周每天安排与记了多少」，
 * 两边共用同一份日期键口径（'YYYY-MM-DD'），不引入新的时区处理。
 */
import { shiftDay } from '@/core/utils/dateKey'

/** JS 的 0=周日；这里统一成 1=周一 … 7=周日 */
export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(year, month - 1, day).getDay()
  return value === 0 ? 7 : value
}

/** 这一天所在周的周一 */
export function startOfWeek(dateKey: string): string {
  return shiftDay(dateKey, 1 - weekdayOf(dateKey))
}

/** 这一天所在周的七天，周一到周日 */
export function weekDates(dateKey: string): string[] {
  const start = startOfWeek(dateKey)
  return Array.from({ length: 7 }, (_, index) => shiftDay(start, index))
}

/** 首尾日期，用来查这一周的记录条数 */
export function weekRange(dateKey: string): { from: string; to: string } {
  const start = startOfWeek(dateKey)
  return { from: start, to: shiftDay(start, 6) }
}

/** 往前 / 往后翻一周 */
export function shiftWeek(dateKey: string, delta: number): string {
  return shiftDay(startOfWeek(dateKey), delta * 7)
}

/** 是不是本周（以设备本地日期算） */
export function isThisWeek(dateKey: string, today: string): boolean {
  return startOfWeek(dateKey) === startOfWeek(today)
}
