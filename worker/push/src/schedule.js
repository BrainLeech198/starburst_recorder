/**
 * 「现在该不该推这条提醒」的纯逻辑。
 *
 * 服务端不存用户的日程内容，只存「几点 + 哪类」，所以这里要做的判断非常窄：
 * 把 `now` 换算到订阅时上报的时区，看某个提醒位的本地时间是否正好等于这一刻。
 *
 * 单独拆出来是为了能测：时区换算是最容易在夏令时上出错的地方，而它又不依赖
 * Worker 的任何东西（只用 `Intl`）。
 */

/** `Intl` 给的 weekday 是英文缩写，转成客户端用的 0=周日 … 6=周六 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * 把某个瞬间换算成「订阅方时区」的本地日期、星期与时分。
 *
 * 刻意不用 `Date#getHours`：那读的是 Worker 自己的时区（线上固定 UTC），
 * 用户在 UTC+8 设的 9:30 会被当成 9:30 UTC，直接晚 8 小时。
 */
export function localParts(timeZone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = {}
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value
  // 有的 ICU 把午夜给成 "24"（hour12:false 的已知行为），取模回 0
  const hour = String(Number(parts.hour) % 24).padStart(2, '0')
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    time: `${hour}:${parts.minute}`,
  }
}

/** 订阅时上报的时区名要能真的用，否则每分钟的换算都会抛异常、整轮 cron 挂掉 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * 某个提醒位在这一分钟是否命中。一次性日期优先；重复规则可按周、月、年选择多天，
 * 并受本地日期的起止范围约束。
 */
export function matchSlot(slot, parts) {
  if (!slot || slot.time !== parts.time) return false
  if (slot.date) return slot.date === parts.dateKey
  if (slot.startDate && parts.dateKey < slot.startDate) return false
  if (slot.endDate && parts.dateKey > slot.endDate) return false
  if (Array.isArray(slot.weekdays)) return slot.weekdays.includes(parts.weekday)
  if (Array.isArray(slot.monthlyDays)) return slot.monthlyDays.includes(Number(parts.dateKey.slice(8, 10)))
  if (Array.isArray(slot.yearlyDates)) return slot.yearlyDates.includes(parts.dateKey.slice(5))
  return false
}

/** 同一条提醒同一天同一分钟只推一次：cron 重试或重叠执行都不会重复弹窗 */
export function dedupeKey(subscriptionKey, slot, parts) {
  return `sent:${subscriptionKey}:${slot.id}:${parts.dateKey}:${parts.time}`
}
