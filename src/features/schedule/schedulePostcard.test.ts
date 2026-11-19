import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/core/db/schema'
import { buildDailyPostcardData } from './schedulePostcard'

function schedule(patch: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1', code: 'abc1234', dateKey: '2026-11-01', endDate: '2026-11-30',
    time: '', title: '背单词', note: '', repeat: 'daily', weeklyDays: [], remind: false,
    doneAt: null, doneDays: [], checkIns: [], createdAt: 1, updatedAt: 1, deletedAt: null,
    ...patch,
  }
}

describe('daily postcard data', () => {
  it('summarizes only completed tasks for the selected date, including their note and photo', () => {
    const photo = { id: 'p1', dataUrl: 'data:image/jpeg;base64,AA', width: 8, height: 6 }
    const items = [
      schedule({
        doneDays: ['2026-11-02'],
        checkIns: [{ dateKey: '2026-11-02', note: '复习了 35 个单词', photo, recordedAt: 1 }],
      }),
      schedule({ id: 's2', title: '算法题', doneDays: ['2026-11-01'], checkIns: [] }),
    ]

    expect(buildDailyPostcardData(items, '2026-11-02')).toEqual({
      dateKey: '2026-11-02',
      done: 1,
      total: 2,
      entries: [{ title: '背单词', note: '复习了 35 个单词', photoDataUrl: photo.dataUrl }],
    })
  })
})
