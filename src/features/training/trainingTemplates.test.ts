import { describe, expect, it } from 'vitest'
import type { HealthTraining, TrainingTemplate } from '@/core/db/schema'
import { templateFromTraining, trainingFromTemplate } from './trainingTemplates'

const workout: HealthTraining = {
  id: 'old', code: '0000001', dateKey: '2026-11-12', time: '19:15', kind: 'strength',
  title: '推', exercises: [{
    id: 'ex1', name: '俯卧撑', kind: 'strength', muscle: 'chest',
    sets: [{ reps: 10, weightKg: null, durationSec: null, restSec: 60, rpe: 6 }],
    durationMin: null, distanceKm: null, note: '',
  }], durationMin: 30, feeling: 4, note: '最近状态好',
  createdAt: 1, updatedAt: 2, deletedAt: null,
}

describe('训练模板映射', () => {
  it('保存训练内容为模板，但不把单次感受、备注和时间带进去', () => {
    const template = templateFromTraining(workout, '推日', 'template-1')
    expect(template).toMatchObject({ name: '推日', kind: 'strength', title: '推', durationMin: 30 })
    expect(template?.exercises[0].sets[0]).toMatchObject({ reps: 10, restSec: 60 })
    expect(template).not.toHaveProperty('time')
    expect(template).not.toHaveProperty('feeling')
    expect(template).not.toHaveProperty('note')
    expect(templateFromTraining(workout, '  ', 'template-2')).toBeNull()
  })

  it('按模板开新记录时日期可指定、时刻留空、单次字段不复用', () => {
    const template: TrainingTemplate = templateFromTraining(workout, '推日', 'template-1')!
    const fresh = trainingFromTemplate(template, '2026-11-13', 'new', '0000002', 10)
    expect(fresh).toMatchObject({
      id: 'new', dateKey: '2026-11-13', time: '', feeling: null, note: '',
      createdAt: 10, updatedAt: 10, deletedAt: null,
    })
    expect(fresh.exercises[0].sets).toEqual(workout.exercises[0].sets)
    expect(fresh.exercises[0].id).not.toBe(workout.exercises[0].id)
  })
})
