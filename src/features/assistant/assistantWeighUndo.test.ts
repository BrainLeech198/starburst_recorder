import { describe, expect, it } from 'vitest'
import type { HealthProfile } from '@/core/db/schema'
import { undoWeighWrite } from './assistantWeighUndo'

function profile(): HealthProfile {
  return {
    id: 'me', sex: null, age: null, heightCm: null,
    weightKg: 70, weightAt: 10, activity: null, tdee: null,
    targetKcal: null, proteinTarget: null, plan: '', note: '保留这段备注',
    weighDay: null, weighTime: '07:00', idealBedtime: '23:00', idealWakeTime: '07:00',
    weighIns: [{ dateKey: '2026-10-28', weightKg: 70, createdAt: 10 }], updatedAt: 10,
  }
}

describe('撤销助手称重', () => {
  it('同日覆盖后恢复旧称重，并保留后来改的档案字段', () => {
    const previous = profile()
    const current = { ...previous, note: '用户后来改的备注', weightKg: 69, weightAt: 20,
      weighIns: [{ dateKey: '2026-10-28', weightKg: 69, createdAt: 20 }] }
    const undone = undoWeighWrite(current, previous, '2026-10-28', 69, 20, 30)
    expect(undone?.weighIns).toEqual(previous.weighIns)
    expect(undone?.weightKg).toBe(70)
    expect(undone?.note).toBe('用户后来改的备注')
  })

  it('同一天又被改过时不覆盖后来的称重', () => {
    const previous = profile()
    const current = { ...previous, weightKg: 68, weightAt: 30,
      weighIns: [{ dateKey: '2026-10-28', weightKg: 68, createdAt: 30 }] }
    expect(undoWeighWrite(current, previous, '2026-10-28', 69, 20, 40)).toBeNull()
  })

  it('没有后续改动时完整恢复因 120 条上限被挤掉的旧记录', () => {
    const previous = profile()
    previous.weighIns = Array.from({ length: 120 }, (_, index) => ({
      dateKey: `2025-${String(Math.floor(index / 30) + 1).padStart(2, '0')}-${String(index % 30 + 1).padStart(2, '0')}`,
      weightKg: 70, createdAt: 120 - index,
    }))
    const current = { ...previous, weightKg: 69, weightAt: 200, updatedAt: 200,
      weighIns: [{ dateKey: '2026-10-28', weightKg: 69, createdAt: 200 }, ...previous.weighIns.slice(0, 119)] }
    const undone = undoWeighWrite(current, previous, '2026-10-28', 69, 200, 300)
    expect(undone?.weighIns).toHaveLength(120)
    expect(undone?.weighIns[119]).toEqual(previous.weighIns[119])
  })
})
