import { describe, expect, test } from 'vitest'
import { financeTrendScale } from './financeTrendScale'

describe('financeTrendScale', () => {
  test('金额跨度平常时保持线性刻度', () => {
    const scale = financeTrendScale([50, 100, 0])

    expect(scale.compressed).toBe(false)
    expect(scale.maximum).toBe(100)
    expect(scale.scaleAmount(50) / scale.plottedMaximum).toBe(0.5)
    expect(scale.ticks).toEqual([100, 50, 0])
  })

  test('出现百万级收入时仍让约百元的周支出保持可见', () => {
    const scale = financeTrendScale([80, 90, 100, 120, 1_000_000])

    expect(scale.compressed).toBe(true)
    expect(scale.scaleAmount(90) / scale.plottedMaximum).toBeGreaterThanOrEqual(0.19)
  })

  test('单个正数和负数异常值不会触发压缩或画到零轴下方', () => {
    const scale = financeTrendScale([-5, 0, 100])

    expect(scale.compressed).toBe(false)
    expect(scale.scaleAmount(-5)).toBe(0)
    expect(scale.maximum).toBe(100)
  })
})
