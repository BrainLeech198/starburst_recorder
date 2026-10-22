const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 按设备本地时区把 Date 转成 'YYYY-MM-DD' */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

/** '星期X' */
export function weekdayLabel(dateKey: string): string {
  return WEEKDAYS[parseDateKey(dateKey).getDay()]
}

/**
 * 列表左上角的相对日期，只给一个粗粒度方向，不替代具体日期：
 * 是今天 / 昨天 / 明天 / 前几天 / 后几天 / 前几月 / 后几月 / 去年 / 明年 / 前几年 / 后几年。
 * 今天以外、又同月但超过一周的，落在「这个月」。
 */
export function relativeDayLabel(dateKey: string, today = todayKey()): string {
  const target = parseDateKey(dateKey)
  const base = parseDateKey(today)
  const dayDiff = Math.round((target.getTime() - base.getTime()) / 86400000)

  if (dayDiff === 0) return '是今天'
  if (dayDiff === -1) return '昨天'
  if (dayDiff === 1) return '明天'

  const yearDiff = target.getFullYear() - base.getFullYear()

  if (dayDiff < 0) {
    if (dayDiff >= -7) return '前几天'
    if (yearDiff <= -2) return '前几年'
    if (yearDiff === -1) return '去年'
    if (target.getMonth() < base.getMonth()) return '前几月'
    return '这个月'
  }

  if (dayDiff <= 7) return '后几天'
  if (yearDiff >= 2) return '后几年'
  if (yearDiff === 1) return '明年'
  if (target.getMonth() > base.getMonth()) return '后几月'
  return '这个月'
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
