/**
 * 体重趋势、睡眠条和卡片小评价的纯逻辑。
 *
 * 全部不碰 React 和存储：页面只管把数据和坐标画出来，
 * 判断「这段曲线怎么走」「这一觉算长算短」这类事都放在这里，好写单测。
 */
import type { WeighIn } from '@/core/db/schema'
import { shiftDay } from '@/core/utils/dateKey'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { sleepMinutes } from './sleepMath'

/** 体重趋势的四个区间，单位是天（30 天在界面上叫「近一月」） */
export type TrendRange = 3 | 5 | 7 | 30

export const TREND_RANGES: TrendRange[] = [3, 5, 7, 30]

/** 取区间内（含今天）的称重，按日期从早到晚；区间外的旧记录不画 */
export function trendWeighIns(
  weighIns: WeighIn[],
  range: TrendRange,
  today: string,
): WeighIn[] {
  const from = shiftDay(today, -(range - 1))
  return weighIns
    .filter((item) => item.dateKey >= from && item.dateKey <= today)
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}

export interface TrendPoint {
  x: number
  y: number
}

export interface TrendGeometry {
  points: TrendPoint[]
  min: number
  max: number
}

/**
 * 把数值铺到 SVG 坐标：横轴等距，纵轴按最大最小值铺满并留出上下边距。
 * 只有一个点或所有值相同的时候，补一条水平中线，不至于画出屏幕外。
 */
export function trendPoints(
  values: number[],
  width: number,
  height: number,
  pad: number,
): TrendGeometry {
  if (values.length === 0) return { points: [], min: 0, max: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  // 值全一样时上下各留 0.5，让线落在中间，而不是贴着顶或底
  const top = span === 0 ? max + 0.5 : max
  const bottom = span === 0 ? min - 0.5 : min
  const usable = Math.max(1, height - pad * 2)
  const points = values.map((value, index) => ({
    x:
      values.length === 1
        ? width / 2
        : pad + (index * (width - pad * 2)) / (values.length - 1),
    y: pad + (1 - (value - bottom) / (top - bottom)) * usable,
  }))
  return { points, min, max }
}

/** 时刻相对 0 点的分钟数；12:00 及以后算负（放到零点左边） */
export function offsetFromMidnight(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  const total = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
  return total >= 720 ? total - 1440 : total
}

/** -720…720 分钟映射到 0…100%：0 点在正中间 */
export function midnightPercent(minutes: number): number {
  return ((Math.min(720, Math.max(-720, minutes)) + 720) / 1440) * 100
}

export interface SleepBarLayout {
  /** 实际睡眠条起止（百分比） */
  startPct: number
  endPct: number
  /** 理想作息窗口的起止（百分比） */
  idealStartPct: number
  idealEndPct: number
  /** 实际睡了多久，分钟 */
  durationMin: number
}

/**
 * 睡眠条布局：以 0 点为中心，左右各 12 小时。
 * 入睡时刻落在 12:00 之后就算负偏移（昨晚），起床时刻落在 12:00 之前就算正偏移（今早）；
 * 两头都落在同半边时按「跨了 24 小时」理解，避免出现一条反向的条。
 */
export function sleepBarLayout(
  bedtime: string,
  wakeTime: string,
  idealBedtime: string,
  idealWakeTime: string,
): SleepBarLayout {
  let start = offsetFromMidnight(bedtime)
  let end = offsetFromMidnight(wakeTime)
  while (end <= start) end += 1440
  start = Math.max(-720, start)
  end = Math.min(720, end)
  if (end <= start) end = Math.min(720, start + 1)

  let idealStart = offsetFromMidnight(idealBedtime)
  let idealEnd = offsetFromMidnight(idealWakeTime)
  while (idealEnd <= idealStart) idealEnd += 1440
  idealStart = Math.max(-720, idealStart)
  idealEnd = Math.min(720, idealEnd)

  return {
    startPct: midnightPercent(start),
    endPct: midnightPercent(end),
    idealStartPct: midnightPercent(idealStart),
    idealEndPct: midnightPercent(idealEnd),
    durationMin: sleepMinutes(bedtime, wakeTime),
  }
}

/** 今日摄入跟目标比一比：太少吃、正好、超一点、超太多 */
export function intakeReviewKey(kcal: number, target: number | null): MessageKey | null {
  if (!(kcal > 0)) return null
  if (target === null || target <= 0) return 'review.intakeGood'
  const ratio = kcal / target
  if (ratio < 0.6) return 'review.intakeLight'
  if (ratio <= 1.1) return 'review.intakeGood'
  if (ratio <= 1.35) return 'review.intakeOver'
  return 'review.intakeWayOver'
}

/** 最近两次称重比一比；只有一次时给一句「先记着」 */
export function weightReviewKey(weighIns: WeighIn[]): MessageKey | null {
  if (weighIns.length === 0) return null
  if (weighIns.length === 1) return 'review.weightFirst'
  const sorted = [...weighIns].sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  )
  const latest = sorted[sorted.length - 1]
  const previous = sorted[sorted.length - 2]
  const diff = latest.weightKg - previous.weightKg
  if (diff <= -0.3) return 'review.weightDown'
  if (diff >= 0.3) return 'review.weightUp'
  return 'review.weightFlat'
}

/** 这一觉算短、算正常、算长；有质量评分时再细一档 */
export function sleepReviewKey(minutes: number, quality: number | null): MessageKey | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes < 360) return 'review.sleepShort'
  if (minutes > 540) return 'review.sleepLong'
  if (quality !== null && quality >= 4) return 'review.sleepGreat'
  return 'review.sleepGood'
}
