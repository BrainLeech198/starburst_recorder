import { describe, expect, it } from 'vitest'
import type { HealthTraining, TrainingExercise, TrainingSet } from '@/core/db/schema'
import {
  daysBetween,
  durationOf,
  formatDuration,
  formatVolume,
  summarizeDay,
  summarizeWeek,
  trainingLabel,
  volumeOf,
  weekRange,
  weekStartOf,
  weekdayOf,
} from './trainingMath'

function set(overrides: Partial<TrainingSet> = {}): TrainingSet {
  return { reps: null, weightKg: null, durationSec: null, restSec: null, rpe: null, ...overrides }
}

function exercise(overrides: Partial<TrainingExercise> = {}): TrainingExercise {
  return {
    id: 'ex1',
    name: '卧推',
    kind: 'strength',
    muscle: 'chest',
    sets: [],
    durationMin: null,
    distanceKm: null,
    note: '',
    ...overrides,
  }
}

function training(overrides: Partial<HealthTraining> = {}): HealthTraining {
  return {
    id: 'tr1',
    code: 'T000001',
    dateKey: '2026-11-02',
    time: '19:00',
    kind: 'strength',
    title: '',
    exercises: [],
    durationMin: null,
    feeling: null,
    note: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  }
}

const t = (key: string, params: Record<string, string | number> = {}) => `${key}:${JSON.stringify(params)}`

describe('容量与组数', () => {
  it('容量 = Σ 次数 × 负重，缺负重不进容量但次数照算', () => {
    const rows = [
      training({
        exercises: [
          exercise({
            sets: [
              set({ reps: 8, weightKg: 40 }),
              set({ reps: 8, weightKg: 40 }),
              set({ reps: 10 }),
            ],
          }),
        ],
      }),
    ]
    expect(volumeOf(rows)).toBe(640)
    expect(summarizeDay(rows)).toMatchObject({
      sessions: 1,
      totalSets: 3,
      totalReps: 26,
      volumeKg: 640,
    })
  })

  it('空组不计，回收站里的记录不计', () => {
    const rows = [
      training({
        exercises: [exercise({ sets: [set(), set({ reps: 5, weightKg: 20 })] })],
      }),
      training({
        id: 'tr2',
        deletedAt: 100,
        exercises: [exercise({ sets: [set({ reps: 10, weightKg: 100 })] })],
      }),
    ]
    expect(summarizeDay(rows)).toMatchObject({ sessions: 1, totalSets: 2, volumeKg: 100 })
  })
})

describe('时长', () => {
  it('整场时长优先', () => {
    const rows = [
      training({ durationMin: 50, exercises: [exercise({ durationMin: 10, sets: [set()] })] }),
    ]
    expect(durationOf(rows[0])).toBe(50)
  })

  it('整场为空时累加各动作时长', () => {
    const row = training({
      exercises: [exercise({ durationMin: 15 }), exercise({ id: 'ex2', durationMin: 25 })],
    })
    expect(durationOf(row)).toBe(40)
  })

  it('再为空时按每组秒数换算并四舍五入', () => {
    const row = training({
      exercises: [
        exercise({
          sets: [set({ durationSec: 100 }), set({ durationSec: 110 }), set({ durationSec: 100 })],
        }),
      ],
    })
    expect(durationOf(row)).toBe(5)
  })
})

describe('周范围与断档', () => {
  it('周一是一周起点，周日归到前一个周一', () => {
    expect(weekdayOf('2026-10-26')).toBe(1)
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26')
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26')
    expect(weekRange('2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })

  it('gapDays：今天 / 昨天 / 从未', () => {
    const today = '2026-11-02'
    expect(summarizeWeek([training({ dateKey: today })], '2026-11-02', today).gapDays).toBe(0)
    expect(summarizeWeek([training({ dateKey: '2026-11-01' })], '2026-11-02', today).gapDays).toBe(1)
    expect(summarizeWeek([], '2026-11-02', today).gapDays).toBe(-1)
  })

  it('跨月天数差按日历算', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('本周与上周分开统计，部位按出现次数计数', () => {
    const rows = [
      training({
        dateKey: '2026-11-02',
        exercises: [
          exercise({ sets: [set({ reps: 10, weightKg: 50 })], muscle: 'chest' }),
          exercise({ id: 'ex2', sets: [set({ reps: 10, weightKg: 30 })], muscle: 'chest' }),
        ],
      }),
      training({
        id: 'tr2',
        dateKey: '2026-11-03',
        exercises: [exercise({ id: 'ex3', muscle: 'back', sets: [set({ reps: 5, weightKg: 60 })] })],
      }),
      training({
        id: 'tr3',
        dateKey: '2026-10-27',
        exercises: [exercise({ id: 'ex4', sets: [set({ reps: 10, weightKg: 20 })] })],
      }),
    ]
    const summary = summarizeWeek(rows, '2026-11-02', '2026-11-04')
    expect(summary).toMatchObject({
      sessions: 2,
      days: 2,
      volumeKg: 1100,
      previousVolumeKg: 200,
    })
    expect(summary.muscleCount).toEqual({ chest: 2, back: 1 })
  })
})

describe('展示格式', () => {
  it('标题兜底到第一个动作名', () => {
    expect(trainingLabel(training({ title: ' 推日 ' }))).toBe('推日')
    expect(trainingLabel(training({ exercises: [exercise({ name: '深蹲' })] }))).toBe('深蹲')
    expect(trainingLabel(training())).toBe('')
  })

  it('容量超过一千加千位分隔', () => {
    expect(formatVolume(640)).toBe('640 kg')
    expect(formatVolume(12_345.6)).toBe('12,345.6 kg')
  })

  it('时长超过一小时拆成小时与分钟', () => {
    expect(formatDuration(45, t)).toBe('training.minutesShort:{"n":45}')
    expect(formatDuration(80, t)).toBe('training.hoursMinutes:{"h":1,"m":20}')
  })
})
