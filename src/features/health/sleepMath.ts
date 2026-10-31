/**
 * 睡眠的纯计算：时长、夜醒汇总与排序。
 *
 * 只认 'HH:MM'（进库前 normalize 已经兜过底）。时长是派生值不落库：
 * 跨零点的觉（23:10 → 07:00）自动按第二天早上算。
 */
import type { SleepWakeEvent } from '@/core/db/schema'

function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(':').map(Number)
  return hour * 60 + minute
}

/** 这一夜睡了多少分钟：起床时刻不比就寝早就说明跨了零点，自动 +24h */
export function sleepMinutes(bedtime: string, wakeTime: string): number {
  const bed = minutesOf(bedtime)
  const wake = minutesOf(wakeTime)
  return wake >= bed ? wake - bed : wake + 24 * 60 - bed
}

/** 时长拆成小时与分钟，给「X 小时 Y 分」这类文案用 */
export function sleepParts(minutes: number): { h: number; m: number } {
  const safe = Math.max(0, Math.round(minutes))
  return { h: Math.floor(safe / 60), m: safe % 60 }
}

/** 从就寝时刻算起的偏移分钟：跨零点后的事件排在后面 */
function nightOffset(clock: string, bedtime: string): number {
  const diff = minutesOf(clock) - minutesOf(bedtime)
  return diff < 0 ? diff + 24 * 60 : diff
}

/** 按这一夜的先后顺序排列夜醒，跨零点也不会把凌晨的醒错排到最前 */
export function sortWakeEvents<T extends { time: string }>(events: T[], bedtime: string): T[] {
  return [...events].sort((a, b) => nightOffset(a.time, bedtime) - nightOffset(b.time, bedtime))
}

/**
 * 夜醒的次数与累计分钟：有逐条事件时以事件为准，否则退回旧记录里的汇总字段。
 * 展示、评价、导出都走这一处，避免新旧两种口径各算一套。
 */
export function sleepWakeStats(sleep: {
  wakeEvents?: SleepWakeEvent[] | null
  wakeCount?: number | null
  wakeMinutes?: number | null
}): { count: number | null; minutes: number | null } {
  const events = Array.isArray(sleep.wakeEvents) ? sleep.wakeEvents : []
  if (events.length > 0) {
    return {
      count: events.length,
      minutes: events.reduce((sum, event) => sum + event.minutes, 0),
    }
  }
  return {
    count: typeof sleep.wakeCount === 'number' ? sleep.wakeCount : null,
    minutes: typeof sleep.wakeMinutes === 'number' ? sleep.wakeMinutes : null,
  }
}
