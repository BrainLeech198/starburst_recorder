import type { HealthIntake, HealthSleep, HealthTraining, HealthMeasurement, WeighIn } from '@/core/db/schema'

export interface NutritionSplit {
  recordedDays: number
  averageKcal: number | null
  averageProtein: number | null
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null
}

/** 只在有摄入记录的日期比较：是否有训练记录，不把缺失摄入补成零。 */
export function nutritionByTrainingRecord(intakes: HealthIntake[], trainings: HealthTraining[]) {
  const trainingDays = new Set(
    trainings.filter((item) => item.deletedAt === null).map((item) => item.dateKey),
  )
  const days = new Map<string, { kcal: number; protein: number }>()
  for (const intake of intakes) {
    const total = days.get(intake.dateKey) ?? { kcal: 0, protein: 0 }
    total.kcal += intake.kcal
    total.protein += intake.protein
    days.set(intake.dateKey, total)
  }
  const split = { training: [] as { kcal: number; protein: number }[], noTrainingRecord: [] as { kcal: number; protein: number }[] }
  for (const [day, total] of days) {
    split[trainingDays.has(day) ? 'training' : 'noTrainingRecord'].push(total)
  }
  const summarize = (items: typeof split.training): NutritionSplit => ({
    recordedDays: items.length,
    averageKcal: average(items.map((item) => item.kcal)),
    averageProtein: average(items.map((item) => item.protein)),
  })
  return { training: summarize(split.training), noTrainingRecord: summarize(split.noTrainingRecord) }
}

function clockMinute(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 平均实际入睡相对理想入睡的偏移；正数表示更晚，缺失/坏时间不参与。 */
export function averageBedtimeOffset(sleeps: HealthSleep[], idealBedtime: string) {
  const ideal = clockMinute(idealBedtime)
  if (ideal === null) return { averageMinutes: null, sampleNights: 0 }
  const offsets = sleeps.flatMap((sleep) => {
    const actual = clockMinute(sleep.bedtime)
    if (actual === null || sleep.deletedAt !== null) return []
    return [((actual - ideal + 720 + 1440) % 1440) - 720]
  })
  return { averageMinutes: average(offsets), sampleNights: offsets.length }
}

/** 近区间每类资料有记录的天数；覆盖度用于描述记录，不代表健康表现。 */
export function recordCoverage(input: {
  from: string
  to: string
  intakes: HealthIntake[]
  sleeps: HealthSleep[]
  trainings: HealthTraining[]
  measurements: HealthMeasurement[]
  weighIns: WeighIn[]
}) {
  const days = new Set<string>()
  for (let day = input.from; day <= input.to; day = addOneDay(day)) days.add(day)
  const inRange = (date: string) => date >= input.from && date <= input.to
  const count = (dates: string[]) => new Set(dates.filter(inRange)).size
  return {
    totalDays: days.size,
    intakeDays: count(input.intakes.map((row) => row.dateKey)),
    sleepDays: count(input.sleeps.filter((row) => row.deletedAt === null).map((row) => row.dateKey)),
    trainingDays: count(input.trainings.filter((row) => row.deletedAt === null).map((row) => row.dateKey)),
    measurementDays: count(input.measurements.filter((row) => row.deletedAt === null).map((row) => row.dateKey)),
    weightDays: count(input.weighIns.map((row) => row.dateKey)),
  }
}

function addOneDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(year, month - 1, date + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}
