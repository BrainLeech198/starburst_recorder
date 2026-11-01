/**
 * 训练模块的全部计算。组件只渲染，不自己算数字。
 *
 * 口径写死在这里，页面、助手、导出都调同一套，避免「列表说 3 组、详情说 4 组」。
 * 只统计 `deletedAt === null` 的记录：调用方一般已经过滤，这里仍再防一次。
 */
import type { HealthTraining, TrainingSet } from '@/core/db/schema'
import { shiftDay } from '@/core/utils/dateKey'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export interface DaySummary {
  sessions: number
  totalSets: number
  totalReps: number
  volumeKg: number
  totalDurationMin: number
  muscles: string[]
}

export interface WeekSummary {
  sessions: number
  days: number
  volumeKg: number
  previousVolumeKg: number
  muscleCount: Record<string, number>
  gapDays: number
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

function alive(trainings: HealthTraining[]) {
  return trainings.filter((training) => training.deletedAt === null)
}

function setsOf(trainings: HealthTraining[]): TrainingSet[] {
  return trainings.flatMap((training) =>
    (training.exercises ?? []).flatMap((exercise) => exercise.sets ?? []),
  )
}

/** 单次训练的容量：次数和负重都有才算，缺一个不进容量 */
export function volumeOf(trainings: HealthTraining[]): number {
  let total = 0
  for (const set of setsOf(trainings)) {
    if (set.reps === null || set.weightKg === null) continue
    total += set.reps * set.weightKg
  }
  return Math.round(total * 10) / 10
}

/** 单次训练的时长：整场 → 各动作时长之和 → 各组秒数换算 */
export function durationOf(training: HealthTraining): number {
  if (training.durationMin !== null && training.durationMin !== undefined) {
    return training.durationMin
  }
  const exerciseMinutes = (training.exercises ?? [])
    .map((exercise) => exercise.durationMin)
    .filter((minutes): minutes is number => minutes !== null && minutes !== undefined)
  if (exerciseMinutes.length > 0) {
    return exerciseMinutes.reduce((sum, minutes) => sum + minutes, 0)
  }
  const seconds = setsOf([training])
    .map((set) => set.durationSec)
    .filter((value): value is number => value !== null && value !== undefined)
    .reduce((sum, value) => sum + value, 0)
  return Math.round(seconds / 60)
}

export function summarizeDay(trainings: HealthTraining[]): DaySummary {
  const rows = alive(trainings)
  const sets = setsOf(rows)
  const muscles = new Set<string>()
  for (const training of rows) {
    for (const exercise of training.exercises ?? []) {
      if (exercise.muscle) muscles.add(exercise.muscle)
    }
  }
  return {
    sessions: rows.length,
    totalSets: sets.length,
    totalReps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    volumeKg: volumeOf(rows),
    totalDurationMin: rows.reduce((sum, training) => sum + durationOf(training), 0),
    muscles: [...muscles],
  }
}

/** 周一为一周起点：1=周一 … 7=周日 */
export function weekdayOf(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay()
  return ((day + 6) % 7) + 1
}

export function weekStartOf(dateKey: string): string {
  return shiftDay(dateKey, -(weekdayOf(dateKey) - 1))
}

export function weekRange(dateKey: string): { from: string; to: string } {
  const from = weekStartOf(dateKey)
  return { from, to: shiftDay(from, 6) }
}

/** 两个 dateKey 之间差几天：按 UTC 解析，跨时区不会差一天 */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

/**
 * `trainings` 至少覆盖本周与上一周，否则「比上周」算不准。
 * `gapDays` 用全部记录算，不受本周范围影响；从未训练返回 -1。
 */
export function summarizeWeek(
  trainings: HealthTraining[],
  weekStart: string,
  today: string,
): WeekSummary {
  const rows = alive(trainings)
  const end = shiftDay(weekStart, 6)
  const previousStart = shiftDay(weekStart, -7)
  const previousEnd = shiftDay(weekStart, -1)
  const thisWeek = rows.filter(
    (training) => training.dateKey >= weekStart && training.dateKey <= end,
  )
  const lastWeek = rows.filter(
    (training) => training.dateKey >= previousStart && training.dateKey <= previousEnd,
  )

  const muscleCount: Record<string, number> = {}
  for (const training of thisWeek) {
    for (const exercise of training.exercises ?? []) {
      if (!exercise.muscle) continue
      muscleCount[exercise.muscle] = (muscleCount[exercise.muscle] ?? 0) + 1
    }
  }

  const latest = rows.reduce<string | null>(
    (best, training) => (best === null || training.dateKey > best ? training.dateKey : best),
    null,
  )

  return {
    sessions: thisWeek.length,
    days: new Set(thisWeek.map((training) => training.dateKey)).size,
    volumeKg: volumeOf(thisWeek),
    previousVolumeKg: volumeOf(lastWeek),
    muscleCount,
    gapDays: latest === null ? -1 : daysBetween(latest, today),
  }
}

/** 标题兜底：没填标题就用第一个动作名；都没有返回空串，界面再退回类型名 */
export function trainingLabel(training: HealthTraining): string {
  const title = training.title.trim()
  if (title !== '') return title
  const first = (training.exercises ?? []).find((exercise) => exercise.name.trim() !== '')
  return first ? first.name.trim() : ''
}

/** 容量：整数部分加千位分隔，最多留一位小数 */
export function formatVolume(kg: number): string {
  const rounded = Math.round(kg * 10) / 10
  const [whole, fraction] = String(rounded).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction} kg` : `${grouped} kg`
}

/** 时长：超过一小时显示「1 小时 20 分」，否则「45 分钟」 */
export function formatDuration(minutes: number, t: Translate): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return t('training.minutesShort', { n: total })
  return t('training.hoursMinutes', { h: Math.floor(total / 60), m: total % 60 })
}
