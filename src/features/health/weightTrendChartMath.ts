import type { WeighPoint } from './healthMath'

export interface WeightChartPoint extends WeighPoint {
  x: number
  y: number
}

export interface WeightChartGeometry {
  rawPoints: WeightChartPoint[]
  trendPoints: WeightChartPoint[]
  min: number
  max: number
}

/** Place raw readings and the smoothed series on one date axis and one value scale. */
export function weightChartGeometry(
  readings: WeighPoint[],
  trend: WeighPoint[],
  width: number,
  height: number,
  pad: number,
): WeightChartGeometry {
  const sortedReadings = [...readings].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const dates = [...new Set(sortedReadings.map((item) => item.dateKey))]
  const dateIndex = new Map(dates.map((date, index) => [date, index]))
  const values = [...sortedReadings, ...trend].map((item) => item.weightKg)
  if (values.length === 0) return { rawPoints: [], trendPoints: [], min: 0, max: 0 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const top = max === min ? max + 0.5 : max
  const bottom = max === min ? min - 0.5 : min
  const usable = Math.max(1, height - pad * 2)
  const xFor = (dateKey: string) => {
    const index = dateIndex.get(dateKey) ?? 0
    return dates.length <= 1 ? width / 2 : pad + (index * (width - pad * 2)) / (dates.length - 1)
  }
  const yFor = (value: number) => pad + (1 - (value - bottom) / (top - bottom)) * usable
  const toPoint = (item: WeighPoint): WeightChartPoint => ({
    ...item,
    x: xFor(item.dateKey),
    y: yFor(item.weightKg),
  })

  return {
    rawPoints: sortedReadings.map(toPoint),
    trendPoints: [...trend].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map(toPoint),
    min,
    max,
  }
}
