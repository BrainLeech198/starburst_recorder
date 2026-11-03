/**
 * 日历的纯计算：月格子、每日权重、三色混色。
 *
 * 三块记录各自一个基色：「日记 = 暖橙，健康 = 青绿，经济 = 蓝」。
 * 一天里三块都有记录时按条数比例混色，颜色越深表示这天记录越多。
 * 这里不碰存储、不碰 i18n，Node 环境可以直接测。
 */
import type { DayActivity } from '@/core/db/store'
import { shiftDay } from '@/core/utils/dateKey'

/** 图例筛选：全部，或只看某一块 */
export type CalendarFilter = 'all' | 'diary' | 'health' | 'finance'

/** 一天在三块里的记录条数 */
export interface DayWeights {
  diary: number
  health: number
  finance: number
}

/** 月历上的一格；`inMonth` 为 false 的是前后月补位，用来把网格补齐成整周 */
export interface CalendarCell {
  dateKey: string
  /** 几号 */
  day: number
  inMonth: boolean
  weights: DayWeights
  /** 混好的背景色；没有记录时是 null，格子保持透明 */
  tint: string | null
}

/** 三块基色：暖橙、青绿、蓝。图例色点、周视图药丸都取这一份，避免多处写死 */
export const BLOCK_HEX = {
  diary: '#ea580c',
  health: '#10b981',
  finance: '#3b82f6',
} as const

export type BlockKey = keyof typeof BLOCK_HEX

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

const BASE: Record<BlockKey, [number, number, number]> = {
  diary: hexToRgb(BLOCK_HEX.diary),
  health: hexToRgb(BLOCK_HEX.health),
  finance: hexToRgb(BLOCK_HEX.finance),
}

/** 透明度区间：同一套「越多越深」，月历格子与周视图卡片只换区间 */
export interface AlphaRange {
  min: number
  max: number
}

/** 月历格子：小面积，深浅拉得开 */
export const CELL_ALPHA: AlphaRange = { min: 0.16, max: 0.84 }

/** 周视图整张卡片：面积大，同样的透明度会糊成一片，上限压到 0.16 才不像「被选中」 */
export const CARD_ALPHA: AlphaRange = { min: 0.05, max: 0.16 }

/** 把记录拆成三块权重：日记包含随记，健康包含饮食 / 睡眠 / 训练 / 称重 */
export function dayWeights(day: DayActivity): DayWeights {
  return {
    diary: day.entries + day.stamps,
    health: day.intakes + day.sleeps + day.trainings + day.weighIns,
    finance: day.finance,
  }
}

export function totalOf(weights: DayWeights): number {
  return weights.diary + weights.health + weights.finance
}

/** 这一天的得分：看全部时是三块相加，筛一块时只数那一块 */
export function scoreOf(weights: DayWeights, filter: CalendarFilter = 'all'): number {
  return filter === 'all' ? totalOf(weights) : weights[filter]
}

/**
 * 三色混色：按权重做加权 RGB 平均；只筛一块时直接用那一块的基色。
 * 混色与透明度分开导出，周视图要用同一套混色、只换透明度区间。
 */
export function mixRgb(
  weights: DayWeights,
  filter: CalendarFilter = 'all',
): [number, number, number] {
  if (filter !== 'all') return BASE[filter]
  const total = totalOf(weights)
  return (['diary', 'health', 'finance'] as const).reduce<[number, number, number]>(
    (sum, key) => {
      const share = total > 0 ? weights[key] / total : 0
      const base = BASE[key]
      return [sum[0] + base[0] * share, sum[1] + base[1] * share, sum[2] + base[2] * share]
    },
    [0, 0, 0],
  )
}

/**
 * 一天的底色：颜色按三块比例混，透明度按「当天得分 / 区间内最高得分」线性映射。
 * 没有记录返回 null，交给调用方保持透明。
 */
export function dayTint(
  weights: DayWeights,
  maxScore: number,
  alpha: AlphaRange = CELL_ALPHA,
  filter: CalendarFilter = 'all',
): string | null {
  const score = scoreOf(weights, filter)
  if (score <= 0) return null
  const ratio = maxScore > 0 ? Math.min(1, Math.max(0, score / maxScore)) : 0
  const value = alpha.min + (alpha.max - alpha.min) * ratio
  const rgb = mixRgb(weights, filter).map((channel) => Math.round(channel))
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(value.toFixed(2))})`
}

/** 单块基色的半透明底色，给周视图的条数药丸用 */
export function blockTint(kind: BlockKey, alpha: number): string {
  const [r, g, b] = BASE[kind]
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 某个月前后翻页；跨年自动进位 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false
  const [year, month] = value.split('-').map(Number)
  return month >= 1 && month <= 12 && year >= 1900 && year <= 9999
}

/** 某月的首尾日期，用来查这个月的记录条数 */
export function monthRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split('-').map(Number)
  const last = new Date(year, month, 0).getDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, '0')}` }
}

/**
 * 排一个月的格子：周一开头，前后用相邻月份的日子补齐整周。
 * `activities` 是 `activityBetween(monthRange)` 的结果，不在其中的日子按 0 条算。
 */
export function buildMonthGrid(
  monthKey: string,
  activities: DayActivity[],
  filter: CalendarFilter = 'all',
): CalendarCell[] {
  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  // JS 里 0 = 周日；要周一开头，所以把 0 挪到第 6 位
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7
  const firstDay = `${monthKey}-01`

  const byDay = new Map<string, DayWeights>()
  let maxScore = 0
  for (const item of activities) {
    if (!item.dateKey.startsWith(`${monthKey}-`)) continue
    const weights = dayWeights(item)
    byDay.set(item.dateKey, weights)
    const score = scoreOf(weights, filter)
    if (score > maxScore) maxScore = score
  }

  const cells: CalendarCell[] = []
  for (let index = 0; index < totalCells; index += 1) {
    const dateKey = shiftDay(firstDay, index - offset)
    const inMonth = dateKey.slice(0, 7) === monthKey
    const weights = byDay.get(dateKey) ?? { diary: 0, health: 0, finance: 0 }
    cells.push({
      dateKey,
      day: Number(dateKey.slice(8, 10)),
      inMonth,
      weights,
      tint: inMonth ? dayTint(weights, maxScore, CELL_ALPHA, filter) : null,
    })
  }
  return cells
}
