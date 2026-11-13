import { describe, expect, it } from 'vitest'
import type { HealthTraining } from '@/core/db/schema'
import { buildTrainingReviewPrompt } from './trainingReview'

const row: HealthTraining = {
  id: 't1', code: 't1', dateKey: '2026-11-10', time: '', kind: 'strength', title: '推',
  exercises: [{
    id: 'e1', name: '卧推', kind: 'strength', muscle: 'chest',
    sets: [{ reps: 8, weightKg: 40, durationSec: null, restSec: null, rpe: null }],
    durationMin: null, distanceKm: null, note: '',
  }],
  durationMin: null, feeling: null, note: '', createdAt: 1, updatedAt: 1, deletedAt: null,
}

describe('训练 AI 周点评素材', () => {
  it('只提供选定日期范围内的未删除训练，不带身体或其他模块数据', () => {
    const prompt = buildTrainingReviewPrompt(
      [row, { ...row, id: 'old', dateKey: '2026-11-01' }, { ...row, id: 'deleted', deletedAt: 2 }],
      '2026-11-09',
      '2026-11-15',
      'zh',
    )
    expect(prompt.rows).toHaveLength(1)
    expect(prompt.user).toContain('卧推')
    expect(prompt.user).not.toContain('2026-11-01')
    expect(prompt.system).toContain('简体中文')
    expect(prompt.system).toContain('不提供诊断')
  })
})
