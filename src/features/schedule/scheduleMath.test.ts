import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/core/db/schema'
import {
  countByDay,
  dateKeysOfMonth,
  donePatch,
  dueOn,
  isDoneOn,
  isRemindableLater,
  occursOn,
  occurrencesOn,
  weekdayOf,
} from './scheduleMath'

function item(patch: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
    code: 'abc1234',
    dateKey: '2026-11-01',
    time: '09:00',
    title: '测试',
    note: '',
    repeat: 'none',
    weeklyDays: [],
    remind: false,
    doneAt: null,
    doneDays: [],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...patch,
  }
}

describe('weekdayOf', () => {
  it('1=周一 … 7=周日', () => {
    expect(weekdayOf('2026-11-02')).toBe(1)
    expect(weekdayOf('2026-11-01')).toBe(7)
    expect(weekdayOf('2026-11-07')).toBe(6)
  })
})

describe('occursOn', () => {
  it('一次性日程只落在当天', () => {
    const row = item({ dateKey: '2026-11-05' })
    expect(occursOn(row, '2026-11-05')).toBe(true)
    expect(occursOn(row, '2026-11-06')).toBe(false)
  })

  it('定期任务从起始日开始，之前不算', () => {
    const row = item({ dateKey: '2026-11-05', repeat: 'daily' })
    expect(occursOn(row, '2026-11-04')).toBe(false)
    expect(occursOn(row, '2026-11-05')).toBe(true)
    expect(occursOn(row, '2026-12-31')).toBe(true)
  })

  it('每周任务只看选中的那几天', () => {
    const row = item({ dateKey: '2026-11-01', repeat: 'weekly', weeklyDays: [1, 3] })
    expect(occursOn(row, '2026-11-02')).toBe(true) // 周一
    expect(occursOn(row, '2026-11-03')).toBe(false) // 周二
    expect(occursOn(row, '2026-11-04')).toBe(true) // 周三
  })

  it('回收站里的不算', () => {
    const row = item({ deletedAt: 123 })
    expect(occursOn(row, '2026-11-01')).toBe(false)
  })
})

describe('occurrencesOn / countByDay', () => {
  it('按时刻排序，全天的排最前', () => {
    const rows = [
      item({ id: 'a', time: '18:00' }),
      item({ id: 'b', time: '' }),
      item({ id: 'c', time: '08:00' }),
    ]
    expect(occurrencesOn(rows, '2026-11-01').map((row) => row.id)).toEqual(['b', 'c', 'a'])
  })

  it('只统计当天有出现的日子', () => {
    const rows = [item({ repeat: 'daily', dateKey: '2026-11-01', weeklyDays: [] })]
    const counts = countByDay(rows, dateKeysOfMonth('2026-11'))
    expect(counts.get('2026-11-01')).toBe(1)
    expect(counts.get('2026-11-30')).toBe(1)
    expect(counts.get('2026-10-31')).toBeUndefined()
  })

  it('当月天数按真实月份算', () => {
    expect(dateKeysOfMonth('2026-02')).toHaveLength(28)
    expect(dateKeysOfMonth('2024-02')).toHaveLength(29)
  })
})

describe('完成状态', () => {
  it('一次性日程只认 doneAt', () => {
    const row = item()
    expect(isDoneOn(row, '2026-11-01')).toBe(false)
    expect(isDoneOn({ ...row, doneAt: 1 }, '2026-11-01')).toBe(true)
  })

  it('定期任务按天记，昨天的勾不影响今天', () => {
    const row = item({ repeat: 'daily' })
    const patched = { ...row, ...donePatch(row, '2026-11-03', true) }
    expect(isDoneOn(patched, '2026-11-03')).toBe(true)
    expect(isDoneOn(patched, '2026-11-04')).toBe(false)
  })

  it('取消勾会把那一天从记录里去掉', () => {
    const row = item({ repeat: 'weekly', weeklyDays: [1], doneDays: ['2026-11-02', '2026-11-09'] })
    const patch = donePatch(row, '2026-11-02', false)
    expect(patch.doneDays).toEqual(['2026-11-09'])
  })

  it('完成记录最多留 400 天', () => {
    const many = Array.from({ length: 400 }, (_, index) => `2026-${String((index % 12) + 1).padStart(2, '0')}-01`)
    const row = item({ repeat: 'daily', doneDays: many })
    expect(donePatch(row, '2026-12-31', true).doneDays.length).toBeLessThanOrEqual(400)
  })
})

describe('提醒', () => {
  it('到点且没做完才提醒', () => {
    const row = item({ time: '09:00', remind: true })
    expect(dueOn([row], '2026-11-01', '08:59')).toHaveLength(0)
    expect(dueOn([row], '2026-11-01', '09:00')).toHaveLength(1)
    expect(dueOn([{ ...row, doneAt: 1 }], '2026-11-01', '10:00')).toHaveLength(0)
    expect(dueOn([{ ...row, remind: false }], '2026-11-01', '10:00')).toHaveLength(0)
  })

  it('全天日程到当天就算到点', () => {
    const row = item({ time: '', remind: true })
    expect(dueOn([row], '2026-11-01', '00:01')).toHaveLength(1)
  })

  it('一次性日程只排未来 30 天的提醒', () => {
    expect(isRemindableLater(item({ remind: true, dateKey: '2026-11-20' }), '2026-11-01')).toBe(true)
    expect(isRemindableLater(item({ remind: true, dateKey: '2027-01-01' }), '2026-11-01')).toBe(false)
    expect(isRemindableLater(item({ remind: true, repeat: 'daily' }), '2026-11-01')).toBe(true)
  })
})
