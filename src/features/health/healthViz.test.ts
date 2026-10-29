import { describe, expect, it } from 'vitest'
import type { WeighIn } from '@/core/db/schema'
import {
  intakeReviewKey,
  midnightPercent,
  offsetFromMidnight,
  sleepBarLayout,
  sleepReviewKey,
  trendPoints,
  trendWeighIns,
  weightReviewKey,
} from './healthViz'

function weight(dateKey: string, value: number): WeighIn {
  return { dateKey, weightKg: value, createdAt: 0 }
}

describe('体重趋势', () => {
  it('只取区间内、按日期升序', () => {
    const list = [weight('2026-10-01', 61), weight('2026-10-27', 62), weight('2026-10-26', 62.5)]
    expect(trendWeighIns(list, 3, '2026-10-28').map((item) => item.dateKey)).toEqual([
      '2026-10-26',
      '2026-10-27',
    ])
    expect(trendWeighIns(list, 30, '2026-10-28').map((item) => item.dateKey)).toEqual([
      '2026-10-01',
      '2026-10-26',
      '2026-10-27',
    ])
  })

  it('未来日期不画进趋势', () => {
    expect(trendWeighIns([weight('2026-10-29', 62)], 7, '2026-10-28')).toHaveLength(0)
  })

  it('单点落在正中；值全相同给一条中线', () => {
    expect(trendPoints([62], 100, 60, 10).points).toEqual([{ x: 50, y: 30 }])
    const flat = trendPoints([62, 62, 62], 100, 60, 10)
    flat.points.forEach((point) => expect(point.y).toBeCloseTo(30))
  })

  it('高点在上、低点在下', () => {
    const { points } = trendPoints([60, 64], 100, 60, 10)
    expect(points[0].y).toBeGreaterThan(points[1].y)
    expect(points[1].x).toBe(90)
  })
})

describe('睡眠条', () => {
  it('0 点是正中间，12 点两边是端点', () => {
    expect(midnightPercent(0)).toBe(50)
    expect(midnightPercent(-720)).toBe(0)
    expect(midnightPercent(720)).toBe(100)
    expect(offsetFromMidnight('23:00')).toBe(-60)
    expect(offsetFromMidnight('07:00')).toBe(420)
  })

  it('23:00→07:00 是从零点左边到右边', () => {
    const bar = sleepBarLayout('23:00', '07:00', '22:30', '06:30')
    expect(bar.startPct).toBeCloseTo(45.83, 1)
    expect(bar.endPct).toBeCloseTo(79.17, 1)
    expect(bar.durationMin).toBe(480)
    expect(bar.idealStartPct).toBeLessThan(bar.startPct)
  })

  it('半夜之后入睡也落在零点右边', () => {
    const bar = sleepBarLayout('01:00', '09:00', '23:00', '07:00')
    expect(bar.startPct).toBeCloseTo(54.17, 1)
    expect(bar.endPct).toBeCloseTo(87.5, 1)
  })
})

describe('卡片小评价', () => {
  it('摄入按目标比例分档', () => {
    expect(intakeReviewKey(0, 2000)).toBeNull()
    expect(intakeReviewKey(1000, 2000)).toBe('review.intakeLight')
    expect(intakeReviewKey(1900, 2000)).toBe('review.intakeGood')
    expect(intakeReviewKey(2100, 2000)).toBe('review.intakeGood')
    expect(intakeReviewKey(2500, 2000)).toBe('review.intakeOver')
    expect(intakeReviewKey(3200, 2000)).toBe('review.intakeWayOver')
    expect(intakeReviewKey(1800, null)).toBe('review.intakeGood')
  })

  it('体重按最近两次的变化分档', () => {
    expect(weightReviewKey([])).toBeNull()
    expect(weightReviewKey([weight('2026-10-01', 62)])).toBe('review.weightFirst')
    expect(weightReviewKey([weight('2026-10-01', 62), weight('2026-10-08', 61.5)]))
      .toBe('review.weightDown')
    expect(weightReviewKey([weight('2026-10-01', 62), weight('2026-10-08', 63)]))
      .toBe('review.weightUp')
    expect(weightReviewKey([weight('2026-10-01', 62), weight('2026-10-08', 62.1)]))
      .toBe('review.weightFlat')
  })

  it('睡眠按时长与质量分档', () => {
    expect(sleepReviewKey(0, null)).toBeNull()
    expect(sleepReviewKey(300, null)).toBe('review.sleepShort')
    expect(sleepReviewKey(480, 5)).toBe('review.sleepGreat')
    expect(sleepReviewKey(480, 1)).toBe('review.sleepGood')
    expect(sleepReviewKey(480, null)).toBe('review.sleepGood')
    expect(sleepReviewKey(600, null)).toBe('review.sleepLong')
  })
})
