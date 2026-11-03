import { describe, expect, it } from 'vitest'
import type { DayActivity } from '@/core/db/store'
import {
  BLOCK_HEX,
  CARD_ALPHA,
  CELL_ALPHA,
  blockTint,
  buildMonthGrid,
  dayTint,
  dayWeights,
  isMonthKey,
  mixRgb,
  monthRange,
  scoreOf,
  shiftMonthKey,
} from './calendarData'

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

describe('dayTint', () => {
  it('没有记录不着色', () => {
    expect(dayTint({ diary: 0, health: 0, finance: 0 }, 10)).toBeNull()
  })

  it('透明度按传入区间线性映射，超出区间夹到端点', () => {
    const weights = { diary: 5, health: 0, finance: 0 }
    expect(dayTint(weights, 20, CARD_ALPHA)).toBe('rgba(234, 88, 12, 0.08)')
    expect(dayTint(weights, 5, CARD_ALPHA)).toBe('rgba(234, 88, 12, 0.16)')
    expect(dayTint(weights, 1, CARD_ALPHA)).toBe('rgba(234, 88, 12, 0.16)')
  })

  it('周视图的区间比月历浅，同一份记录不会糊成一片', () => {
    const weights = { diary: 2, health: 2, finance: 2 }
    const cell = dayTint(weights, 6, CELL_ALPHA) ?? ''
    const card = dayTint(weights, 6, CARD_ALPHA) ?? ''
    const alphaOf = (tint: string) => Number(tint.split(', ')[3].replace(')', ''))
    expect(alphaOf(cell)).toBeCloseTo(0.84, 2)
    expect(alphaOf(card)).toBeCloseTo(0.16, 2)
  })

  it('筛一块时只数那一块，没记录就返回 null', () => {
    const weights = { diary: 3, health: 0, finance: 0 }
    expect(dayTint(weights, 3, CARD_ALPHA, 'health')).toBeNull()
    expect(dayTint(weights, 3, CARD_ALPHA, 'diary')).toBe('rgba(234, 88, 12, 0.16)')
  })
})

describe('三块基色', () => {
  it('混色用的 RGB 与图例 hex 是同一份', () => {
    expect(mixRgb({ diary: 3, health: 0, finance: 0 })).toEqual([234, 88, 12])
    expect(mixRgb({ diary: 0, health: 3, finance: 0 })).toEqual([16, 185, 129])
    expect(mixRgb({ diary: 0, health: 0, finance: 3 })).toEqual([59, 130, 246])
    expect(BLOCK_HEX).toEqual({ diary: '#ea580c', health: '#10b981', finance: '#3b82f6' })
  })

  it('单块底色给的是该块的半透明基色', () => {
    expect(blockTint('diary', 0.16)).toBe('rgba(234, 88, 12, 0.16)')
    expect(blockTint('finance', 0.16)).toBe('rgba(59, 130, 246, 0.16)')
  })

  it('得分看全部时三块相加', () => {
    expect(scoreOf({ diary: 1, health: 2, finance: 3 })).toBe(6)
    expect(scoreOf({ diary: 1, health: 2, finance: 3 }, 'health')).toBe(2)
  })
})
