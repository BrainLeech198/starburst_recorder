import { describe, expect, it } from 'vitest'
import type { HealthIntake, HealthSleep, HealthTraining } from '@/core/db/schema'
import { averageBedtimeOffset, nutritionByTrainingRecord, recordCoverage } from './healthInsights'

const intake = (dateKey: string, kcal: number, protein: number): HealthIntake => ({
  id: `${dateKey}-${kcal}`, code: 'x', dateKey, time: '', foodId: null, name: 'meal', grams: 0,
  kcal, protein, carbs: 0, fat: 0, source: 'manual', mealId: null, components: null,
  tdeeSnapshot: null, targetKcalSnapshot: null, proteinTargetSnapshot: null,
  createdAt: 1, updatedAt: 1, deletedAt: null,
})

const sleep = (dateKey: string, bedtime: string): HealthSleep => ({
  id: dateKey, code: 'x', dateKey, bedtime, wakeTime: '', quality: null,
  wakeEvents: [], naps: [], wakeCount: null, wakeMinutes: null, note: '',
  createdAt: 1, updatedAt: 1, deletedAt: null,
})

describe('健康派生统计', () => {
  it('只比较有摄入记录的训练记录日和未记录训练日', () => {
    const result = nutritionByTrainingRecord(
      [intake('2026-11-10', 1800, 90), intake('2026-11-10', 200, 10), intake('2026-11-11', 2200, 100)],
      [{ id: 't1', code: 't1', dateKey: '2026-11-10', time: '', kind: 'strength', title: '', exercises: [], durationMin: null, feeling: null, note: '', createdAt: 1, updatedAt: 1, deletedAt: null }],
    )
    expect(result.training).toEqual({ recordedDays: 1, averageKcal: 2000, averageProtein: 100 })
    expect(result.noTrainingRecord).toEqual({ recordedDays: 1, averageKcal: 2200, averageProtein: 100 })
  })

  it('跨午夜比较实际入睡和理想时刻，并跳过缺失时间', () => {
    expect(averageBedtimeOffset([sleep('2026-11-10', '00:30'), sleep('2026-11-11', '')], '23:00'))
      .toEqual({ averageMinutes: 90, sampleNights: 1 })
  })

  it('记录覆盖只计算区间内有记录的日期', () => {
    const empty = { from: '2026-11-10', to: '2026-11-12', intakes: [intake('2026-11-10', 1, 1)],
      sleeps: [sleep('2026-11-11', '23:00')], trainings: [] as HealthTraining[], measurements: [], weighIns: [] }
    expect(recordCoverage(empty)).toMatchObject({ totalDays: 3, intakeDays: 1, sleepDays: 1, trainingDays: 0 })
  })
})
