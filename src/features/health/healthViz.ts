/**
 * 体重趋势、睡眠条和卡片小评价的纯逻辑。
 *
 * 全部不碰 React 和存储：页面只管把数据和坐标画出来，
 * 判断「这段曲线怎么走」「这一觉算长算短」这类事都放在这里，好写单测。
 */
import type { HealthIntake, HealthSleep, WeighIn } from '@/core/db/schema'
import { shiftDay } from '@/core/utils/dateKey'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { sleepMinutes, sleepWakeStats } from './sleepMath'

/** 体重趋势的区间，单位是天（30 天在界面上叫「近一月」） */
export type TrendRange = 3 | 5 | 7 | 30 | 90

/** 健康首页小卡片上只放短区间，详情页再给更长的 90 天 */
export const TREND_RANGES: TrendRange[] = [3, 5, 7, 30]

/** 趋势详情页的区间：至少一周才看得出走势 */
export const DETAIL_TREND_RANGES: TrendRange[] = [7, 30, 90]

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

export interface WeightTrendStats {
  /** 区间内最后一次称重 */
  latest: number
  /** 区间内第一次称重 */
  first: number
  /** 首尾之差；正数是涨 */
  delta: number
  min: number
  max: number
  average: number
  /** 首尾相隔几天；同一天为 0 */
  spanDays: number
  /** 线性回归折出来的每周变化；不到 3 天或点全在同一天时为 null */
  weekly: number | null
}

/** 按日期升序排一份副本，称重历史本身的顺序不作数 */
function ascending(items: WeighIn[]): WeighIn[] {
  return [...items].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}

/** 每天变化多少公斤；点数不够或横轴跨度为 0 时返回 null */
function dailySlope(items: WeighIn[]): number | null {
  if (items.length < 2) return null
  const first = items[0].dateKey
  const xs = items.map((item) => daysBetween(first, item.dateKey))
  const ys = items.map((item) => item.weightKg)
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let numerator = 0
  let denominator = 0
  xs.forEach((x, index) => {
    numerator += (x - meanX) * (ys[index] - meanY)
    denominator += (x - meanX) ** 2
  })
  return denominator === 0 ? null : numerator / denominator
}

/**
 * 区间摘要：最新、首尾差、平均、最高最低，以及按线性回归折出来的周均变化。
 * 用回归而不是「最后两点之差」，是因为每周称重时相邻两点波动很大，回归更接近真实趋势。
 */
export function weightTrendStats(items: WeighIn[]): WeightTrendStats | null {
  if (items.length === 0) return null
  const sorted = ascending(items)
  const values = sorted.map((item) => item.weightKg)
  const first = values[0]
  const latest = values[values.length - 1]
  const spanDays = daysBetween(sorted[0].dateKey, sorted[sorted.length - 1].dateKey)
  const slope = dailySlope(sorted)
  return {
    latest,
    first,
    delta: Math.round((latest - first) * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
    spanDays,
    // 跨不到 3 天时，一天的波动会被放大成「一周掉几公斤」，不如不给
    weekly: slope === null || spanDays < 3 ? null : Math.round(slope * 7 * 100) / 100,
  }
}

/** BMI：身高没填或数值不合理时返回 null，页面自己决定显不显示 */
export function bmiValue(weightKg: number, heightCm: number | null | undefined): number | null {
  if (!heightCm || heightCm <= 0 || !(weightKg > 0)) return null
  const meters = heightCm / 100
  return Math.round((weightKg / (meters * meters)) * 10) / 10
}

/** 区间内摄入与睡眠的汇总；只统计有记录的天 / 夜，不拿空白日拉低平均 */
export interface HealthRangeSummary {
  /** 有摄入记录的天数 */
  intakeDays: number
  /** 这些天的日均热量 */
  avgKcal: number | null
  /** 有蛋白目标、且记过摄入的天数 */
  proteinDays: number
  /** 其中蛋白达标的天数 */
  proteinHitDays: number
  /** 有睡眠记录的夜数 */
  sleepNights: number
  /** 这些夜的平均睡眠分钟数 */
  avgSleepMinutes: number | null
  /** 有夜醒的夜数 */
  wakeNights: number
}

/**
 * 摄入 / 睡眠的区间汇总：先按天合并摄入，再算日均；
 * 睡眠按时长取平均，夜醒次数用逐条事件汇总（旧记录回退到汇总字段）。
 */
export function healthRangeSummary(params: {
  intakes: Pick<HealthIntake, 'dateKey' | 'kcal' | 'protein'>[]
  sleeps: Pick<
    HealthSleep,
    'bedtime' | 'wakeTime' | 'wakeEvents' | 'wakeCount' | 'wakeMinutes'
  >[]
  proteinTarget: number | null
}): HealthRangeSummary {
  const byDay = new Map<string, { kcal: number; protein: number }>()
  for (const intake of params.intakes) {
    const day = byDay.get(intake.dateKey) ?? { kcal: 0, protein: 0 }
    day.kcal += intake.kcal
    day.protein += intake.protein
    byDay.set(intake.dateKey, day)
  }
  const days = [...byDay.values()]
  const target = params.proteinTarget
  const hasProteinTarget = target !== null && target > 0
  const totalSleep = params.sleeps.reduce(
    (sum, sleep) => sum + sleepMinutes(sleep.bedtime, sleep.wakeTime),
    0,
  )
  return {
    intakeDays: days.length,
    avgKcal:
      days.length === 0
        ? null
        : Math.round(days.reduce((sum, day) => sum + day.kcal, 0) / days.length),
    proteinDays: hasProteinTarget ? days.length : 0,
    proteinHitDays: hasProteinTarget ? days.filter((day) => day.protein >= target).length : 0,
    sleepNights: params.sleeps.length,
    avgSleepMinutes:
      params.sleeps.length === 0 ? null : Math.round(totalSleep / params.sleeps.length),
    wakeNights: params.sleeps.filter((sleep) => (sleepWakeStats(sleep).count ?? 0) > 0).length,
  }
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

/** 今日摄入跟目标比一比：太少吃、正好、超一点、超太多；给了蛋白目标时再看蛋白够不够 */
export function intakeReviewKey(
  kcal: number,
  target: number | null,
  protein: number | null = null,
  proteinTarget: number | null = null,
): MessageKey | null {
  if (!(kcal > 0)) return null
  if (target === null || target <= 0) return 'review.intakeGood'
  const ratio = kcal / target
  if (ratio < 0.6) return 'review.intakeLight'
  if (ratio > 1.35) return 'review.intakeWayOver'
  if (ratio > 1.1) return 'review.intakeOver'
  // 热量没超标时，蛋白差太多更值得提醒；蛋白够了就给一句更具体的肯定
  if (proteinTarget !== null && proteinTarget > 0 && protein !== null) {
    if (protein < proteinTarget * 0.6) return 'review.intakeLowProtein'
    if (protein >= proteinTarget) return 'review.intakeProteinHit'
  }
  return 'review.intakeGood'
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
  // 隔了不到一天就差了 0.3 kg 以上，多半是水分 / 没空腹，别当成真趋势
  if (daysBetween(previous.dateKey, latest.dateKey) <= 1 && Math.abs(diff) >= 0.3) {
    return 'review.weightFluctuation'
  }
  if (diff <= -0.3) return 'review.weightDown'
  if (diff >= 0.3) return 'review.weightUp'
  return 'review.weightFlat'
}

/** 'YYYY-MM-DD' 之间差几天，只用于判断短期波动 */
function daysBetween(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00').getTime()
  const end = new Date(to + 'T00:00:00').getTime()
  return Math.round((end - start) / 86400000)
}

/** 这一觉算短、算正常、算长；夜醒频繁时优先提醒，有质量评分时再细一档 */
export function sleepReviewKey(
  minutes: number,
  quality: number | null,
  wakeCount: number | null = null,
  wakeMinutes: number | null = null,
): MessageKey | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes < 360) return 'review.sleepShort'
  const wakes = wakeCount ?? 0
  const awakeMin = wakeMinutes ?? 0
  // 醒来 3 次以上或累计醒了半小时，睡眠已经被切碎，比「睡够没」更影响白天状态
  if (wakes >= 3 || awakeMin >= 30) return 'review.sleepFragmented'
  if (wakes > 0) return 'review.sleepWoken'
  if (minutes > 540) return 'review.sleepLong'
  if (quality !== null && quality >= 4) return 'review.sleepGreat'
  return 'review.sleepGood'
}

/** 夜醒文案：次数、分钟都记了就合在一句，只记一项时各说各的 */
export function sleepWakeMessage(
  wakeCount: number | null | undefined,
  wakeMinutes: number | null | undefined,
): { key: MessageKey; params: Record<string, number> } | null {
  const count = typeof wakeCount === 'number' ? wakeCount : null
  const minutes = typeof wakeMinutes === 'number' ? wakeMinutes : null
  if (count !== null && minutes !== null) {
    return { key: 'health.sleepWakeLine', params: { n: count, m: minutes } }
  }
  if (count !== null) return { key: 'health.sleepWakeCountLine', params: { n: count } }
  if (minutes !== null) return { key: 'health.sleepWakeMinutesLine', params: { m: minutes } }
  return null
}
