import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDateCn,
  formatMonthDayCn,
  formatStamp,
  monthGrid,
  toDateKey,
  weekdayLabel,
} from './dateKey'

describe('toDateKey', () => {
  it('按本地时区补零', () => {
    expect(toDateKey(new Date(2026, 0, 9))).toBe('2026-01-09')
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('中文日期格式', () => {
  it('带年份与只留月日', () => {
    expect(formatDateCn('2026-01-09')).toBe('2026年1月9日')
    expect(formatMonthDayCn('2026-01-09')).toBe('1月9日')
  })

  it('星期按本地日历算', () => {
    expect(weekdayLabel('2026-01-09')).toBe('星期五')
    expect(weekdayLabel('2026-10-21')).toBe('星期三')
  })
})

describe('时刻格式', () => {
  it('纸条上的时间戳与角落时刻', () => {
    const stamp = new Date(2026, 9, 18, 18, 5).getTime()
    expect(formatStamp(stamp)).toBe('2026/10/18-18:05')
    expect(formatClock(stamp)).toBe('18:05')
  })
})

describe('monthGrid', () => {
  it('普通月与闰年 2 月', () => {
    expect(monthGrid(2026, 2)).toEqual({ firstWeekday: 0, daysInMonth: 28 })
    expect(monthGrid(2024, 2)).toEqual({ firstWeekday: 4, daysInMonth: 29 })
  })
})
