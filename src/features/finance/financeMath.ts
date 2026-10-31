/**
 * 经济的纯计算：月份键、月份切换、月度收支汇总。
 *
 * 金额一律按正数存，方向看 kind；汇总只认未删除的记录。
 * 这里不碰存储和 i18n，方便单测和以后复用到月报。
 */
import type { FinanceEntry } from '@/core/db/schema'

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

export interface FinanceSummary {
  /** 收入合计 */
  income: number
  /** 支出合计 */
  expense: number
  /** 结余 = 收入 - 支出 */
  balance: number
}

/** 汇总一组收支；已删除的记录不算 */
export function summarizeFinance(entries: FinanceEntry[]): FinanceSummary {
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
