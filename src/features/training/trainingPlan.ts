/**
 * 训练提醒的纯判断：什么时候该提醒、哪些通知 id 要排。
 *
 * 这里不碰通知插件，也不读数据库——`trainingNotify.ts` 只负责把这里的结论发出去，
 * 于是「周几命中」「今天已练就不催」这些规则能单独测。
 */
import type { HealthProfile, TrainingPlan } from '@/core/db/schema'
import { pickTrainingPlan } from '@/core/db/normalize'
import { weekdayOf } from './trainingMath'

export const DEFAULT_TRAINING_PLAN: TrainingPlan = {
  enabled: false,
  weeklyDays: [1, 3, 5],
  time: '20:00',
  nudgeAfterDays: 3,
  templates: [],
}

/** 旧档案没有 trainingPlan：补一份默认值，并挡住坏字段 */
export function normalizePlan(plan: TrainingPlan | undefined): TrainingPlan {
  if (!plan) return { ...DEFAULT_TRAINING_PLAN, weeklyDays: [...DEFAULT_TRAINING_PLAN.weeklyDays], templates: [] }
  const safe = pickTrainingPlan(plan) ?? DEFAULT_TRAINING_PLAN
  const days = [...new Set(safe.weeklyDays.filter((day) => day >= 1 && day <= 7))].sort(
    (a, b) => a - b,
  )
  return {
    enabled: safe.enabled,
    weeklyDays: days,
    time: safe.time,
    nudgeAfterDays:
      Number.isInteger(safe.nudgeAfterDays) && safe.nudgeAfterDays >= 0 && safe.nudgeAfterDays <= 30
        ? safe.nudgeAfterDays
        : DEFAULT_TRAINING_PLAN.nudgeAfterDays,
    templates: safe.templates ?? [],
  }
}

export function planOfProfile(profile: HealthProfile | undefined): TrainingPlan {
  return normalizePlan(profile?.trainingPlan)
}

/** 今天是不是计划里的训练日 */
export function isPlanDay(plan: TrainingPlan, dateKey: string): boolean {
  return plan.weeklyDays.includes(weekdayOf(dateKey))
}

/** 到点没有：HH:MM 字符串直接比较即可 */
export function isTimeReached(plan: TrainingPlan, clock: string): boolean {
  return clock >= plan.time
}

export interface RemindInput {
  plan: TrainingPlan
  dateKey: string
  /** 现在的 'HH:MM' */
  clock: string
  trainedToday: boolean
  /** 今天已经弹过计划提醒 */
  notifiedToday: boolean
}

/** 计划提醒：开关开、周几命中、到点、今天没练、今天没提醒过 */
export function shouldRemindPlan(input: RemindInput): boolean {
  const plan = normalizePlan(input.plan)
  if (!plan.enabled || plan.weeklyDays.length === 0) return false
  if (!isPlanDay(plan, input.dateKey)) return false
  if (!isTimeReached(plan, input.clock)) return false
  if (input.trainedToday) return false
  return !input.notifiedToday
}

/** 断档提醒：nudgeAfterDays=0 表示关闭；今天已经提醒过就不再弹 */
export function shouldNudge(plan: TrainingPlan, gapDays: number, nudgedToday: boolean): boolean {
  const days = normalizePlan(plan).nudgeAfterDays
  if (days <= 0) return false
  if (gapDays < days) return false
  return !nudgedToday
}

/** Capacitor 的 weekday 是 1=周日；我们的 weeklyDays 是 1=周一 */
export function notificationWeekday(day: number): number {
  return (day % 7) + 1
}
