import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/core/db/schema'
import { buildDailyPostcardData, fitPostcardPhoto } from './schedulePostcard'

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
        checkIns: [{ code: 'c0ffee1', dateKey: '2026-11-02', note: '复习了 35 个单词', photo, recordedAt: 1 }],
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

describe('postcard photo sizing', () => {
  it('keeps a tall photo intact within the height limit', () => {
    const size = fitPostcardPhoto(600, 2400)
    expect(size).toEqual({ width: 250, height: 1000 })
    expect(size.width / size.height).toBe(600 / 2400)
  })

  it('keeps a wide photo intact within the postcard width', () => {
    const size = fitPostcardPhoto(2400, 600)
    expect(size).toEqual({ width: 872, height: 218 })
    expect(size.width / size.height).toBe(2400 / 600)
  })
})
