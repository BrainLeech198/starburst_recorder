import { describe, expect, it } from 'vitest'
import type { WeighIn } from '@/core/db/schema'
import {
  intakeReviewKey,
  midnightPercent,
  offsetFromMidnight,
  sleepBarLayout,
  sleepReviewKey,
  sleepWakeMessage,
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
    // 热量达标时看蛋白：蛋白差太多会单独提醒，蛋白够了给更具体的肯定
    expect(intakeReviewKey(1900, 2000, 50, 100)).toBe('review.intakeLowProtein')
    expect(intakeReviewKey(1900, 2000, 110, 100)).toBe('review.intakeProteinHit')
    expect(intakeReviewKey(2500, 2000, 20, 100)).toBe('review.intakeOver')
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
    // 隔天就波动 0.3 kg 以上：先当成水分，不当作真趋势
    expect(weightReviewKey([weight('2026-10-07', 62), weight('2026-10-08', 62.4)]))
      .toBe('review.weightFluctuation')
  })

  it('睡眠按时长与质量分档', () => {
    expect(sleepReviewKey(0, null)).toBeNull()
    expect(sleepReviewKey(300, null)).toBe('review.sleepShort')
    expect(sleepReviewKey(480, 5)).toBe('review.sleepGreat')
    expect(sleepReviewKey(480, 1)).toBe('review.sleepGood')
    expect(sleepReviewKey(480, null)).toBe('review.sleepGood')
    expect(sleepReviewKey(600, null)).toBe('review.sleepLong')
    // 夜醒优先于时长/质量：频繁夜醒提示被切碎，偶尔醒一次单独提醒
    expect(sleepReviewKey(480, null, 1, 5)).toBe('review.sleepWoken')
    expect(sleepReviewKey(480, null, 3, 10)).toBe('review.sleepFragmented')
    expect(sleepReviewKey(480, null, 1, 40)).toBe('review.sleepFragmented')
  })

  it('夜醒文案按记了次数还是分钟组合', () => {
    expect(sleepWakeMessage(null, null)).toBeNull()
    expect(sleepWakeMessage(2, 15)).toEqual({
      key: 'health.sleepWakeLine',
      params: { n: 2, m: 15 },
    })
    expect(sleepWakeMessage(1, null)).toEqual({
      key: 'health.sleepWakeCountLine',
      params: { n: 1 },
    })
    expect(sleepWakeMessage(null, 0)).toEqual({
      key: 'health.sleepWakeMinutesLine',
      params: { m: 0 },
    })
  })
})
