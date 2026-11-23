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

export interface WeightChartDateRange {
  startDateKey: string
  endDateKey: string
}

/** Convert a local calendar date key to a timezone-independent day number. */
function dayNumber(dateKey: string): number {
  const matched = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return NaN
  return Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])) / 86400000
}

/** Place raw readings and the smoothed series on one calendar-proportional date axis and value scale. */
export function weightChartGeometry(
  readings: WeighPoint[],
  trend: WeighPoint[],
  width: number,
  height: number,
  pad: number,
  dateRange?: WeightChartDateRange,
): WeightChartGeometry {
  const sortedReadings = [...readings].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const dates = [...new Set([...sortedReadings, ...trend].map((item) => item.dateKey))]
    .sort((a, b) => a.localeCompare(b))
  const values = [...sortedReadings, ...trend].map((item) => item.weightKg)
  if (values.length === 0) return { rawPoints: [], trendPoints: [], min: 0, max: 0 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const top = max === min ? max + 0.5 : max
  const bottom = max === min ? min - 0.5 : min
  const usable = Math.max(1, height - pad * 2)
  const startDay = dayNumber(dateRange?.startDateKey ?? dates[0])
  const endDay = dayNumber(dateRange?.endDateKey ?? dates[dates.length - 1])
  const dateSpan = endDay - startDay
  const xFor = (dateKey: string) => {
    if (!Number.isFinite(dateSpan) || dateSpan <= 0) return width / 2
    const dayOffset = dayNumber(dateKey) - startDay
    return pad + (dayOffset / dateSpan) * (width - pad * 2)
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
