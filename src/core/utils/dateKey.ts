import type { MessageKey } from '@/shared/i18n/messages/zh'
import { zh } from '@/shared/i18n/messages/zh'

const WEEKDAY_KEYS: MessageKey[] = [
  'date.weekday0',
  'date.weekday1',
  'date.weekday2',
  'date.weekday3',
  'date.weekday4',
  'date.weekday5',
  'date.weekday6',
]

/** 按设备本地时区把 Date 转成 'YYYY-MM-DD' */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 给一个 dateKey，返回前一天 / 后一天；月末日、年首日自动溢出 */
export function shiftDay(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey)
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

export function todayKey(): string {
  return toDateKey(new Date())
}

/** 是不是一个真实存在的 'YYYY-MM-DD'：URL 里的 ?date= 与草稿日期都先过这一道 */
export function isDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** '2026年1月9日' */
export function formatDateCn(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

/** '1月9日'，列表纸条上不需要重复年份 */
export function formatMonthDayCn(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}月${day}日`
}

/** 星期几的文案 key：界面用 t(weekdayKey(...))，导出这类固定中文的文本用 weekdayLabel */
export function weekdayKey(dateKey: string): MessageKey {
  return WEEKDAY_KEYS[parseDateKey(dateKey).getDay()]
}

/** '星期X'：只给导出、AI 提示词这类固定中文的文本用 */
export function weekdayLabel(dateKey: string): string {
  return zh[weekdayKey(dateKey)]
}

/**
 * 列表左上角的相对日期，只给一个粗粒度方向，不替代具体日期：
 * 是今天 / 昨天 / 明天 / 前几天 / 后几天 / 前几月 / 后几月 / 去年 / 明年 / 前几年 / 后几年。
 * 今天以外、又同月但超过一周的，落在「这个月」。
 */
export function relativeDayKey(dateKey: string, today = todayKey()): MessageKey {
  const target = parseDateKey(dateKey)
  const base = parseDateKey(today)
  const dayDiff = Math.round((target.getTime() - base.getTime()) / 86400000)

  if (dayDiff === 0) return 'date.today'
  if (dayDiff === -1) return 'date.yesterday'
  if (dayDiff === 1) return 'date.tomorrow'

  const yearDiff = target.getFullYear() - base.getFullYear()

  if (dayDiff < 0) {
    if (dayDiff >= -7) return 'date.fewDaysAgo'
    if (yearDiff <= -2) return 'date.fewYearsAgo'
    if (yearDiff === -1) return 'date.lastYear'
    if (target.getMonth() < base.getMonth()) return 'date.fewMonthsAgo'
    return 'date.thisMonth'
  }

  if (dayDiff <= 7) return 'date.fewDaysLater'
  if (yearDiff >= 2) return 'date.fewYearsLater'
  if (yearDiff === 1) return 'date.nextYear'
  if (target.getMonth() > base.getMonth()) return 'date.fewMonthsLater'
  return 'date.thisMonth'
}

/** 相对日期的中文文本：只给导出、AI 提示词这类固定中文的文本用 */
export function relativeDayLabel(dateKey: string, today = todayKey()): string {
  return zh[relativeDayKey(dateKey, today)]
}

/** '2026/10/18-18:00' */
export function formatStamp(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}/${month}/${day}-${hour}:${minute}`
}

/** '18:00'，纸条角落只留时刻 */
export function formatClock(ms: number): string {
  const date = new Date(ms)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

/** 某月第一天的星期偏移（0=周日）与总天数 */
export function monthGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  return { firstWeekday, daysInMonth }
}
