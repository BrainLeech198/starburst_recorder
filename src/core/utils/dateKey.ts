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

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** '2026年1月9日' */
export function formatDateCn(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

/** '星期X' */
export function weekdayLabel(dateKey: string): string {
  return WEEKDAYS[parseDateKey(dateKey).getDay()]
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

/** 某月第一天的星期偏移（0=周日）与总天数 */
export function monthGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  return { firstWeekday, daysInMonth }
}
