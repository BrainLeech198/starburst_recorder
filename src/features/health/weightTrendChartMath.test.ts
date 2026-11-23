import { describe, expect, it } from 'vitest'
import { weightChartGeometry } from './weightTrendChartMath'

describe('体重趋势图坐标', () => {
  it('同一天的原始记录和趋势值共用横坐标，并按原始值定位记录点', () => {
    const result = weightChartGeometry(
      [
        { dateKey: '2026-11-20', weightKg: 62 },
        { dateKey: '2026-11-21', weightKg: 63.5 },
        { dateKey: '2026-11-22', weightKg: 62.3 },
      ],
      [
        { dateKey: '2026-11-20', weightKg: 62 },
        { dateKey: '2026-11-22', weightKg: 62.15 },
      ],
      320,
      172,
      24,
    )

    expect(result.rawPoints).toHaveLength(3)
    expect(result.rawPoints[1].x).not.toBe(result.trendPoints[1].x)
    expect(result.rawPoints[2].x).toBe(result.trendPoints[1].x)
    expect(result.rawPoints[1].weightKg).toBe(63.5)
    expect(result.trendPoints[1].weightKg).toBe(62.15)
    expect(result.rawPoints[1].y).not.toBe(result.trendPoints[1].y)
    expect(result.min).toBe(62)
    expect(result.max).toBe(63.5)
  })

  it('按日历间隔放置称重点，不把间隔长短不同的日期画成等距', () => {
    const result = weightChartGeometry(
      [
        { dateKey: '2026-09-22', weightKg: 63 },
        { dateKey: '2026-10-29', weightKg: 62.5 },
        { dateKey: '2026-11-23', weightKg: 62.3 },
      ],
      [],
      320,
      172,
      24,
    )

    expect(result.rawPoints[0].x).toBe(24)
    expect(result.rawPoints[1].x).toBeCloseTo(24 + (37 / 62) * 272, 5)
    expect(result.rawPoints[1].x).not.toBe(160)
    expect(result.rawPoints[2].x).toBe(296)
  })

  it('过滤视图按所选日历窗口定位，包含窗口首尾日期', () => {
    const result = weightChartGeometry(
      [
        { dateKey: '2026-11-17', weightKg: 62.8 },
        { dateKey: '2026-11-20', weightKg: 62.5 },
        { dateKey: '2026-11-23', weightKg: 62.3 },
      ],
      [],
      320,
      172,
      24,
      { startDateKey: '2026-11-17', endDateKey: '2026-11-23' },
    )

    expect(result.rawPoints.map((point) => point.x)).toEqual([24, 160, 296])
  })

  it('保留单条记录的中心位置和常量值范围', () => {
    const result = weightChartGeometry(
      [{ dateKey: '2026-11-22', weightKg: 62 }],
      [{ dateKey: '2026-11-22', weightKg: 62 }],
      320,
      172,
      24,
    )

    expect(result.rawPoints[0]).toMatchObject({ x: 160, y: 86, weightKg: 62 })
    expect(result.min).toBe(62)
    expect(result.max).toBe(62)
  })
})
