import { describe, expect, it } from 'vitest'
import { isThisWeek, shiftWeek, startOfWeek, weekDates, weekRange } from './weekMath'

describe('startOfWeek', () => {
  it('周一本身返回自己', () => {
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
  })

  it('周日归到前一个周一', () => {
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02')
  })

  it('跨月也按真实日期算', () => {
    expect(startOfWeek('2026-11-04')).toBe('2026-11-02')
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29')
  })
})

describe('weekDates / weekRange', () => {
  it('给出周一到周日七天', () => {
    const days = weekDates('2026-11-04')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-11-02')
    expect(days[6]).toBe('2026-11-08')
    expect(weekRange('2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })
})

describe('shiftWeek / isThisWeek', () => {
  it('翻周保持周一', () => {
    expect(shiftWeek('2026-11-04', 1)).toBe('2026-11-09')
    expect(shiftWeek('2026-11-04', -1)).toBe('2026-10-26')
  })

  it('同一周的任意一天都算本周', () => {
    expect(isThisWeek('2026-11-02', '2026-11-08')).toBe(true)
    expect(isThisWeek('2026-11-09', '2026-11-08')).toBe(false)
  })
})
