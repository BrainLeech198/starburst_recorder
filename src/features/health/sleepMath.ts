/**
 * 睡眠的纯计算：时长。
 *
 * 只认 'HH:MM'（进库前 normalize 已经兜过底）。时长是派生值不落库：
 * 跨零点的觉（23:10 → 07:00）自动按第二天早上算。
 */

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
