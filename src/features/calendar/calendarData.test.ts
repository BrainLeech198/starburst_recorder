import { describe, expect, it } from 'vitest'
import type { DayActivity } from '@/core/db/store'
import { buildMonthGrid, dayWeights, isMonthKey, monthRange, shiftMonthKey } from './calendarData'

function activity(dateKey: string, patch: Partial<DayActivity> = {}): DayActivity {
  return {
    dateKey,
    entries: 0,
    stamps: 0,
    intakes: 0,
    sleeps: 0,
    trainings: 0,
    finance: 0,
    weighIns: 0,
    ...patch,
  }
}

describe('dayWeights', () => {
  it('把随记并进日记，饮食 / 睡眠 / 训练 / 称重并进健康', () => {
    expect(
      dayWeights(
        activity('2026-11-01', {
          entries: 1,
          stamps: 2,
          intakes: 3,
          sleeps: 1,
          trainings: 1,
          weighIns: 1,
          finance: 2,
        }),
      ),
    ).toEqual({ diary: 3, health: 6, finance: 2 })
  })
})

describe('month helpers', () => {
  it('翻月跨年进位', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
  })

  it('只认四位年两位月', () => {
    expect(isMonthKey('2026-11')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey('')).toBe(false)
  })

  it('给出当月首尾日期', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

describe('buildMonthGrid', () => {
  it('周一开头，前后月补位凑成整周', () => {
    // 2026-11-01 是周日，所以前面补 6 格（10-26 到 10-31）
    const cells = buildMonthGrid('2026-11', [])
    expect(cells).toHaveLength(42)
    expect(cells[0].dateKey).toBe('2026-10-26')
    expect(cells[0].inMonth).toBe(false)
    expect(cells[6].dateKey).toBe('2026-11-01')
    expect(cells[6].inMonth).toBe(true)
    expect(cells[41].dateKey).toBe('2026-12-06')
  })

  it('没有记录的日子不着色', () => {
    const cells = buildMonthGrid('2026-11', [])
    expect(cells.every((cell) => cell.tint === null)).toBe(true)
  })

  it('只有日记的一天用暖橙基色', () => {
    const cells = buildMonthGrid('2026-11', [activity('2026-11-10', { entries: 2 })])
    const cell = cells.find((item) => item.dateKey === '2026-11-10')
    expect(cell?.tint).toMatch(/^rgba\(234, 88, 12, /)
    expect(cell?.tint).toContain('0.84')
  })

  it('三块都有记录时按条数比例混色', () => {
    const cells = buildMonthGrid(
      '2026-11',
      [activity('2026-11-11', { entries: 2, intakes: 2 })],
    )
    const cell = cells.find((item) => item.dateKey === '2026-11-11')
    // (234 + 16) / 2 = 125，(88 + 185) / 2 = 136.5 → 137，(12 + 129) / 2 = 70.5 → 71
    expect(cell?.tint).toBe('rgba(125, 137, 71, 0.84)')
  })

  it('筛一块时只给这一块有记录的日子着色', () => {
    const days = [
      activity('2026-11-03', { entries: 1 }),
      activity('2026-11-04', { intakes: 1 }),
    ]
    const health = buildMonthGrid('2026-11', days, 'health')
    expect(health.find((item) => item.dateKey === '2026-11-03')?.tint).toBeNull()
    expect(health.find((item) => item.dateKey === '2026-11-04')?.tint).toMatch(
      /^rgba\(16, 185, 129, /,
    )

    const finance = buildMonthGrid('2026-11', days, 'finance')
    expect(finance.some((item) => item.tint !== null)).toBe(false)
  })

  it('记录越多颜色越深', () => {
    const cells = buildMonthGrid(
      '2026-11',
      [activity('2026-11-05', { entries: 1 }), activity('2026-11-06', { entries: 5 })],
    )
    const light = cells.find((item) => item.dateKey === '2026-11-05')?.tint ?? ''
    const dark = cells.find((item) => item.dateKey === '2026-11-06')?.tint ?? ''
    const alphaOf = (tint: string) => Number(tint.split(', ')[3].replace(')', ''))
    expect(alphaOf(dark)).toBeGreaterThan(alphaOf(light))
  })
})
