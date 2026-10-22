import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDateCn,
  formatMonthDayCn,
  formatStamp,
  isDateKey,
  monthGrid,
  relativeDayLabel,
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

describe('isDateKey', () => {
  it('只认真实存在的 YYYY-MM-DD', () => {
    expect(isDateKey('2026-10-15')).toBe(true)
    expect(isDateKey('2024-02-29')).toBe(true)
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-1-5')).toBe(false)
    expect(isDateKey('')).toBe(false)
    expect(isDateKey(undefined)).toBe(false)
  })
})

describe('relativeDayLabel', () => {
  const today = '2026-10-22'

  it('今天/昨天/明天', () => {
    expect(relativeDayLabel('2026-10-22', today)).toBe('是今天')
    expect(relativeDayLabel('2026-10-21', today)).toBe('昨天')
    expect(relativeDayLabel('2026-10-23', today)).toBe('明天')
  })

  it('一周内说前几天/后几天', () => {
    expect(relativeDayLabel('2026-10-18', today)).toBe('前几天')
    expect(relativeDayLabel('2026-10-15', today)).toBe('前几天')
    expect(relativeDayLabel('2026-10-25', today)).toBe('后几天')
    expect(relativeDayLabel('2026-10-29', today)).toBe('后几天')
  })

  it('超过一周看月份，跨年看年份', () => {
    expect(relativeDayLabel('2026-10-10', today)).toBe('这个月')
    expect(relativeDayLabel('2026-10-30', today)).toBe('这个月')
    expect(relativeDayLabel('2026-09-30', today)).toBe('前几月')
    expect(relativeDayLabel('2026-11-05', today)).toBe('后几月')
    expect(relativeDayLabel('2025-12-31', today)).toBe('去年')
    expect(relativeDayLabel('2027-01-01', today)).toBe('明年')
    expect(relativeDayLabel('2024-01-01', today)).toBe('前几年')
    expect(relativeDayLabel('2028-01-01', today)).toBe('后几年')
  })
})
