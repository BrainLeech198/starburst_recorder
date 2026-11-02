import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import { selectRecordPhoto } from './assistantRecordPhoto'

function data(): BackupData {
  return {
    entries: [{ id: 'd1', code: 'D000001', dateKey: '2026-10-28', content: '', tags: [],
      images: [{ id: 'i1', dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10 },
        { id: 'i2', dataUrl: 'data:image/png;base64,BBB', width: 10, height: 10 }],
      createdAt: 1, updatedAt: 1, deletedAt: null }],
    stamps: [], days: [], presets: [], schedules: [], profile: null, foods: [], meals: [],
    intakes: [], sleeps: [], trainings: [], finance: [],
  }
}

describe('指定旧记录照片', () => {
  it('只有本轮明确说了记录和图片序号才返回像素', () => {
    const snapshot = data()
    const allowed = selectRecordPhoto(snapshot, 'diary', 'D000001', 2,
      '请分析 2026-10-28 日记的第二张照片', '2026-10-28')
    expect(allowed).toMatchObject({ ok: true, dataUrl: 'data:image/png;base64,BBB' })
    expect(selectRecordPhoto(snapshot, 'diary', 'D000001', 1,
      '请总结 2026-10-28 的日记', '2026-10-28').ok).toBe(false)
    expect(selectRecordPhoto(snapshot, 'diary', 'D000001', 2,
      '请分析第二张照片', '2026-10-28').ok).toBe(false)
    expect(selectRecordPhoto(snapshot, 'diary', 'D000001', 1,
      '请分析 2026-10-28 日记的照片', '2026-10-28').ok).toBe(false)
    expect(selectRecordPhoto(snapshot, 'diary', 'D000001', 2,
      '不要发送 2026-10-28 日记的第二张照片', '2026-10-28').ok).toBe(false)
  })
})
