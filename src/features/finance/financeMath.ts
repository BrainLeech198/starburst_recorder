/**
 * 经济的纯计算：月份键、月份切换、月度收支汇总。
 *
 * 金额一律按正数存，方向看 kind；汇总只认未删除的记录。
 * 这里不碰存储和 i18n，方便单测和以后复用到月报。
 */
import type { FinanceEntry } from '@/core/db/schema'

/** Fields consumed by finance summaries and lists; photo bytes are optional. */
export type FinanceRow = Omit<FinanceEntry, 'photo'> & {
  photo?: string | null
  hasPhoto?: boolean
}
import { shiftDay } from '@/core/utils/dateKey'

/** '2026-10-31' → '2026-10' */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7)
}

/** 合法月份键必须是真实存在的 'YYYY-MM' */
export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12
}

/** 给月份键前后移动；跨年自动处理 */
export function shiftMonth(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 这个月的第一天与最后一天，用来查库和生成标题 */
export function monthBounds(monthKey: string): { start: string; end: string } {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const last = new Date(year, month, 0).getDate()
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(last).padStart(2, '0')}`,
  }
}

/** 返回 dateKey 所在的周一到周日（含），统一以周一为周首。 */
export function weekBounds(dateKey: string): { start: string; end: string } {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay()
  const mondayOffset = (weekday + 6) % 7
  const start = shiftDay(dateKey, -mondayOffset)
  return { start, end: shiftDay(start, 6) }
}

export interface FinanceSummary {
  /** 收入合计 */
  income: number
  /** 支出合计 */
  expense: number
  /** 结余 = 收入 - 支出 */
  balance: number
}

export interface FinanceWeekSummary extends FinanceSummary {
  /** 自然周周一，用作稳定 key */
  weekStart: string
  /** 自然周与所选月份相交后的首日 */
  rangeStart: string
  /** 自然周与所选月份相交后的末日 */
  rangeEnd: string
}

/** 按自然周拆出所选月份的收支；首尾周只统计月份内的记录。 */
export function financeWeeksOfMonth(entries: FinanceRow[], monthKey: string): FinanceWeekSummary[] {
  const month = monthBounds(monthKey)
  const firstWeek = weekBounds(month.start).start
  const weeks: FinanceWeekSummary[] = []
  for (let weekStart = firstWeek; weekStart <= month.end; weekStart = shiftDay(weekStart, 7)) {
    const week = weekBounds(weekStart)
    const rangeStart = week.start < month.start ? month.start : week.start
    const rangeEnd = week.end > month.end ? month.end : week.end
    const weekEntries = entries.filter(
      (entry) => entry.dateKey >= rangeStart && entry.dateKey <= rangeEnd,
    )
    weeks.push({
      weekStart,
      rangeStart,
      rangeEnd,
      ...summarizeFinance(weekEntries),
    })
  }
  return weeks
}

export interface FinanceDay {
  dateKey: string
  /** 这一天的收支，新的在前 */
  entries: FinanceRow[]
  /** 这一天的小计 */
  summary: FinanceSummary
}

/**
 * 按天分组，日期新的在前，同一天按创建时间新的在前。
 * 已删除的记录直接跳过，页面上不用再过滤一遍。
 */
export function groupFinanceByDay(entries: FinanceRow[]): FinanceDay[] {
  const byDay = new Map<string, FinanceRow[]>()
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue
    const list = byDay.get(entry.dateKey)
    if (list) list.push(entry)
    else byDay.set(entry.dateKey, [entry])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, list]) => ({
      dateKey,
      entries: [...list].sort((a, b) => b.createdAt - a.createdAt),
      summary: summarizeFinance(list),
    }))
}

/** 金额统一保留两位小数，页面和汇总口径一致 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** 汇总一组收支；已删除的记录不算 */
export function summarizeFinance(entries: FinanceRow[]): FinanceSummary {
  let income = 0
  let expense = 0
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue
    if (entry.kind === 'income') income += entry.amount
    else expense += entry.amount
  }
  return {
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    balance: Math.round((income - expense) * 100) / 100,
  }
}

/** 本月支出按分类切出来的一块 */
export interface CategorySlice {
  /** 分类 id，页面再翻译成名称 */
  category: string
  amount: number
  /** 占本月总支出的比例，0–1 */
  share: number
}

/**
 * 支出按分类汇总，金额从大到小。
 * 没有支出时返回空数组，页面据此整块不显示。
 */
export function expenseByCategory(entries: FinanceRow[]): CategorySlice[] {
  let total = 0
  const byCategory = new Map<string, number>()
  for (const entry of entries) {
    if (entry.deletedAt !== null || entry.kind !== 'expense') continue
    total += entry.amount
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount)
  }
  if (total <= 0) return []
  return [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount: roundMoney(amount),
      share: amount / total,
    }))
    .sort((a, b) => b.amount - a.amount)
}
