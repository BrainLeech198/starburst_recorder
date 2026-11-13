import { describe, expect, it } from 'vitest'
import type { HealthTraining, TrainingExercise } from '@/core/db/schema'
import { exerciseProgressOf } from './trainingProgress'

function exercise(sets: TrainingExercise['sets']): TrainingExercise {
  return {
    id: 'ex1', name: '俯卧撑', kind: 'strength', muscle: 'chest', sets,
    durationMin: null, distanceKm: null, note: '',
  }
}

function training(dateKey: string, sets: TrainingExercise['sets']): HealthTraining {
  return {
    id: dateKey, code: dateKey, dateKey, time: '', kind: 'strength', title: '',
    exercises: [exercise(sets)], durationMin: null, feeling: null, note: '',
    createdAt: 1, updatedAt: 1, deletedAt: null,
  }
}

describe('动作进步回顾', () => {
  it('最多留最近八次，并且三次连续完全相同才提示平台期', () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      training(`2026-11-${String(index + 1).padStart(2, '0')}`, [
        { reps: 10, weightKg: null, durationSec: null, restSec: null, rpe: null },
      ]),
    )
    const progress = exerciseProgressOf(rows)[0]
    expect(progress.points).toHaveLength(8)
    expect(progress.plateau).toBe(true)
    expect(progress.points[0].reps).toBe(10)
    expect(progress.points[0].volumeKg).toBeNull()
  })

  it('不同重量仍作为不同表现；回收站记录不参与', () => {
    const rows = [
      training('2026-11-01', [{ reps: 10, weightKg: 20, durationSec: null, restSec: null, rpe: null }]),
      training('2026-11-02', [{ reps: 10, weightKg: 22.5, durationSec: null, restSec: null, rpe: null }]),
      { ...training('2026-11-03', [{ reps: 10, weightKg: 22.5, durationSec: null, restSec: null, rpe: null }]), deletedAt: 4 },
    ]
    const progress = exerciseProgressOf(rows)[0]
    expect(progress.plateau).toBe(false)
    expect(progress.points.map((point) => point.volumeKg)).toEqual([225, 200])
  })
})
