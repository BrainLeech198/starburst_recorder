/** 收支趋势图的数值刻度；极端值触发时压缩比例，但金额始终保留原值。 */
export interface FinanceTrendScale {
  maximum: number
  compressed: boolean
  plottedMaximum: number
  ticks: number[]
  scaleAmount: (value: number) => number
}

function niceMaximum(value: number) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * power
}

function compressedTicks(maximum: number, unit: number) {
  const candidates: number[] = []
  for (let value = unit; value < maximum; value *= 10) candidates.push(value)
  const selected =
    candidates.length <= 3
      ? candidates
      : Array.from({ length: 3 }, (_, index) => {
          const candidateIndex = Math.round((index * (candidates.length - 1)) / 2)
          return candidates[candidateIndex]
        })
  return [maximum, ...selected.reverse(), 0]
}

/**
 * 用低四分位估算日常金额。极端值出现时使用更强的对数压缩，
 * 让普通周的走势仍能占到可辨认的图高；坐标轴和曲线共用同一变换。
 */
export function financeTrendScale(values: number[]): FinanceTrendScale {
  const amounts = values.filter(Number.isFinite).map((value) => Math.max(0, value))
  const maximum = niceMaximum(Math.max(0, ...amounts))
  const positiveValues = amounts.filter((value) => value > 0).sort((a, b) => a - b)
  const typicalValue = positiveValues[Math.floor((positiveValues.length - 1) / 4)] ?? 0
  const compressed = positiveValues.length > 1 && maximum >= typicalValue * 8
  // 低四分位的 1/16 作为对数单位，比旧刻度更能抬高普通金额。
  const compressionUnit = compressed ? niceMaximum(typicalValue / 16) : 1
  const scaleAmount = (value: number) =>
    compressed ? Math.log1p(Math.max(0, value) / compressionUnit) : Math.max(0, value)
  const plottedMaximum = scaleAmount(maximum)
  const ticks = compressed
    ? compressedTicks(maximum, compressionUnit)
    : [maximum, maximum / 2, 0]

  return { maximum, compressed, plottedMaximum, ticks, scaleAmount }
}
