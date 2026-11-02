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

/** 三块基色：暖橙、青绿、蓝 */
const BASE: Record<'diary' | 'health' | 'finance', [number, number, number]> = {
  diary: [234, 88, 12],
  health: [16, 185, 129],
  finance: [59, 130, 246],
}

/** 把记录拆成三块权重：日记包含随记，健康包含饮食 / 睡眠 / 训练 / 称重 */
export function dayWeights(day: DayActivity): DayWeights {
  return {
    diary: day.entries + day.stamps,
    health: day.intakes + day.sleeps + day.trainings + day.weighIns,
    finance: day.finance,
  }
}

function totalOf(weights: DayWeights): number {
  return weights.diary + weights.health + weights.finance
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
 * 三色混色：按权重做加权 RGB 平均；只筛一块时直接用那一块的基色。
 * 透明度按「当天得分 / 当月最高得分」线性映射，最低 0.16，最高 0.84，
 * 这样没有记录的日子一眼是空的，记录最多的那天最扎眼。
 */
function tintOf(weights: DayWeights, score: number, maxScore: number, filter: CalendarFilter): string {
  const ratio = maxScore > 0 ? score / maxScore : 0
  const alpha = 0.16 + 0.68 * Math.min(1, Math.max(0, ratio))

  let rgb: [number, number, number]
  if (filter === 'all') {
    const total = totalOf(weights)
    rgb = (['diary', 'health', 'finance'] as const).reduce<[number, number, number]>(
      (sum, key) => {
        const share = total > 0 ? weights[key] / total : 0
        const base = BASE[key]
        return [
          sum[0] + base[0] * share,
          sum[1] + base[1] * share,
          sum[2] + base[2] * share,
        ]
      },
      [0, 0, 0],
    )
  } else {
    rgb = BASE[filter]
  }

  const round = (value: number) => Math.round(value)
  return `rgba(${round(rgb[0])}, ${round(rgb[1])}, ${round(rgb[2])}, ${Number(alpha.toFixed(2))})`
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
    const score = filter === 'all' ? totalOf(weights) : weights[filter]
    if (score > maxScore) maxScore = score
  }

  const cells: CalendarCell[] = []
  for (let index = 0; index < totalCells; index += 1) {
    const dateKey = shiftDay(firstDay, index - offset)
    const inMonth = dateKey.slice(0, 7) === monthKey
    const weights = byDay.get(dateKey) ?? { diary: 0, health: 0, finance: 0 }
    const score = filter === 'all' ? totalOf(weights) : weights[filter]
    cells.push({
      dateKey,
      day: Number(dateKey.slice(8, 10)),
      inMonth,
      weights,
      tint: inMonth && score > 0 ? tintOf(weights, score, maxScore, filter) : null,
    })
  }
  return cells
}
