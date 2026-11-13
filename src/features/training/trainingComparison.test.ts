import { describe, expect, it } from 'vitest'
import type { HealthTraining } from '@/core/db/schema'
import { compareTrainingWithHistory } from './trainingComparison'

const session = (
  id: string,
  dateKey: string,
  sets: { reps: number | null; weightKg: number | null }[],
  deletedAt: number | null = null,
): HealthTraining => ({
  id, code: id, dateKey, time: '18:00', kind: 'strength', title: '', durationMin: null,
  feeling: null, note: '', createdAt: 1, updatedAt: 1, deletedAt,
  exercises: [{
    id: `ex-${id}`, name: '卧推', kind: 'strength', muscle: 'chest', durationMin: null,
    distanceKm: null, note: '',
    sets: sets.map((set) => ({ ...set, durationSec: null, restSec: null, rpe: null })),
  }],
})

describe('训练完成后比较', () => {
  it('只和最近一次同名动作比较，忽略软删除与当前编辑记录', () => {
    const current = session('new', '2026-11-13', [{ reps: 10, weightKg: 20 }])
    const comparison = compareTrainingWithHistory(current, [
      session('old', '2026-11-10', [{ reps: 8, weightKg: 18 }]),
      session('trash', '2026-11-12', [{ reps: 99, weightKg: 99 }], 5),
      session('new', '2026-11-13', [{ reps: 4, weightKg: 10 }]),
    ])
    expect(comparison).toEqual([{
      exerciseName: '卧推', previousDateKey: '2026-11-10',
      previousMaxReps: 8, currentMaxReps: 10,
      previousMaxLoadKg: 18, currentMaxLoadKg: 20,
    }])
  })

  it('没有记录负重时不计算负重对比', () => {
    const current = session('new', '2026-11-13', [{ reps: 10, weightKg: null }])
    const comparison = compareTrainingWithHistory(
      current,
      [session('old', '2026-11-10', [{ reps: 8, weightKg: null }])],
    )
    expect(comparison[0]).toMatchObject({ previousMaxReps: 8, currentMaxReps: 10 })
    expect(comparison[0].previousMaxLoadKg).toBeNull()
    expect(comparison[0].currentMaxLoadKg).toBeNull()
  })
})
