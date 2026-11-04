import { describe, expect, test } from 'vitest'
import type { FinanceEntry } from '@/core/db/schema'
import {
  expenseByCategory,
  financeWeeksOfMonth,
  groupFinanceByDay,
  isMonthKey,
  monthBounds,
  monthKeyOf,
  roundMoney,
  shiftMonth,
  summarizeFinance,
  weekBounds,
} from './financeMath'

function entry(overrides: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: 'f1',
    code: 'f000001',
    dateKey: '2026-10-31',
    time: '08:00:00',
    kind: 'expense',
    category: 'food',
    name: '午饭',
    amount: 25,
    photo: null,
    note: '',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

describe('monthKeyOf / isMonthKey', () => {
  test('从日期取出月份键', () => {
    expect(monthKeyOf('2026-10-31')).toBe('2026-10')
  })

  test('只认真实存在的 YYYY-MM', () => {
    expect(isMonthKey('2026-10')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey(null)).toBe(false)
  })
})

describe('shiftMonth', () => {
  test('跨年自动进位与退位', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', 3)).toBe('2027-01')
  })
})

describe('monthBounds', () => {
  test('给出当月首尾日期，闰年二月也正确', () => {
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })
})

describe('weekBounds / financeWeeksOfMonth', () => {
  test('周一到周日为自然周，跨月与跨年也正确', () => {
    expect(weekBounds('2026-11-04')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(weekBounds('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })

  test('月份图按自然周分桶，首尾周只纳入当前月份', () => {
    const weeks = financeWeeksOfMonth(
      [
        entry({ id: 'oct', dateKey: '2026-10-31', amount: 500 }),
        entry({ id: 'nov1', dateKey: '2026-11-01', kind: 'income', amount: 1000 }),
        entry({ id: 'nov2', dateKey: '2026-11-02', amount: 120 }),
        entry({ id: 'nov3', dateKey: '2026-11-03', amount: 80 }),
        entry({ id: 'deleted', dateKey: '2026-11-03', amount: 900, deletedAt: 1 }),
        entry({ id: 'dec', dateKey: '2026-12-01', amount: 700 }),
      ],
      '2026-11',
    )

    expect(weeks).toHaveLength(6)
    expect(weeks[0]).toMatchObject({
      weekStart: '2026-10-26',
      rangeStart: '2026-11-01',
      rangeEnd: '2026-11-01',
      income: 1000,
      expense: 0,
    })
    expect(weeks[1]).toMatchObject({
      weekStart: '2026-11-02',
      rangeStart: '2026-11-02',
      rangeEnd: '2026-11-08',
      income: 0,
      expense: 200,
    })
    expect(weeks.at(-1)).toMatchObject({ rangeStart: '2026-11-30', rangeEnd: '2026-11-30' })
  })
})

describe('groupFinanceByDay', () => {
  test('按天分组，日期与创建时间都新的在前', () => {
    const days = groupFinanceByDay([
      entry({ id: 'a', dateKey: '2026-10-30', createdAt: 10, amount: 20 }),
      entry({ id: 'b', dateKey: '2026-10-31', createdAt: 5, amount: 30 }),
      entry({ id: 'c', dateKey: '2026-10-30', createdAt: 30, amount: 12 }),
      entry({ id: 'd', dateKey: '2026-10-31', createdAt: 9, amount: 8, deletedAt: 1 }),
    ])
    expect(days.map((day) => day.dateKey)).toEqual(['2026-10-31', '2026-10-30'])
    expect(days[0].entries.map((item) => item.id)).toEqual(['b'])
    expect(days[1].entries.map((item) => item.id)).toEqual(['c', 'a'])
    expect(days[1].summary).toEqual({ income: 0, expense: 32, balance: -32 })
  })

  test('空列表返回空数组', () => {
    expect(groupFinanceByDay([])).toEqual([])
  })
})

describe('roundMoney', () => {
  test('保留两位小数', () => {
    expect(roundMoney(12.345)).toBe(12.35)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })
})

describe('expenseByCategory', () => {
  test('只算支出，按金额从大到小，占比加起来为 1', () => {
    const slices = expenseByCategory([
      entry({ id: 'a', category: 'food', amount: 30 }),
      entry({ id: 'b', category: 'food', amount: 20 }),
      entry({ id: 'c', category: 'transport', amount: 70 }),
      entry({ id: 'd', kind: 'income', category: 'salary', amount: 1000 }),
      entry({ id: 'e', category: 'fun', amount: 40, deletedAt: 1 }),
    ])
    expect(slices.map((item) => item.category)).toEqual(['transport', 'food'])
    expect(slices[0].amount).toBe(70)
    expect(slices[0].share).toBeCloseTo(70 / 120)
    expect(slices[1].amount).toBe(50)
    expect(slices.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1)
  })

  test('没有支出时返回空数组', () => {
    expect(expenseByCategory([])).toEqual([])
    expect(expenseByCategory([entry({ kind: 'income', amount: 100 })])).toEqual([])
  })
})

describe('summarizeFinance', () => {
  test('按收支方向汇总，结余等于收入减支出', () => {
    expect(
      summarizeFinance([
        entry({ id: 'a', kind: 'expense', amount: 25.5 }),
        entry({ id: 'b', kind: 'expense', amount: 12 }),
        entry({ id: 'c', kind: 'income', amount: 1000 }),
      ]),
    ).toEqual({ income: 1000, expense: 37.5, balance: 962.5 })
  })

  test('已删除的记录不参与汇总', () => {
    expect(
      summarizeFinance([
        entry({ kind: 'expense', amount: 10 }),
        entry({ id: 'b', kind: 'income', amount: 99, deletedAt: 1 }),
      ]),
    ).toEqual({ income: 0, expense: 10, balance: -10 })
  })
})
