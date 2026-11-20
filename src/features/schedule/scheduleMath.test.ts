import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/core/db/schema'
import { stableCode } from '@/core/utils/id'
import {
  countByDay,
  checkInFor,
  checkInHistory,
  checkInPatch,
  dateKeysOfMonth,
  donePatch,
  dueOn,
  isDoneOn,
  isRemindableLater,
  occursOn,
  occurrencesOn,
  recordedAtForCheckIn,
  undoCheckInPatch,
  weekdayOf,
} from './scheduleMath'

function item(patch: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
    code: 'abc1234',
    dateKey: '2026-11-01',
    endDate: null,
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

  it('重复任务在截止日当天有效，之后停止', () => {
    const row = item({ repeat: 'daily', endDate: '2026-11-05' })
    expect(occursOn(row, '2026-11-05')).toBe(true)
    expect(occursOn(row, '2026-11-06')).toBe(false)
  })

  it('旧任务没有截止日时继续按原规则重复', () => {
    const row = item({ repeat: 'daily', endDate: null })
    expect(occursOn(row, '2027-11-01')).toBe(true)
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

  it('一次性日程使用传入的打卡时间戳', () => {
    const row = item()
    expect(donePatch(row, '2026-11-01', true, 1_795_000_123_456).doneAt).toBe(1_795_000_123_456)
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

describe('打卡补充记录', () => {
  it('按任务日期更新文字照片，并保留其它日期的记录', () => {
    const firstPhoto = { id: 'p1', dataUrl: 'data:image/jpeg;base64,AA', width: 8, height: 6 }
    const secondPhoto = { id: 'p2', dataUrl: 'data:image/jpeg;base64,BB', width: 8, height: 6 }
    const row = item({
      repeat: 'daily',
      checkIns: [
        { code: '1111111', dateKey: '2026-11-02', note: '昨天', photo: firstPhoto, recordedAt: 1 },
      ],
    })
    const updated = {
      ...row,
      ...checkInPatch(row, '2026-11-03', { note: ' 复习 35 个词 ', photo: secondPhoto }, 1234),
    }
    expect(checkInFor(updated, '2026-11-02')?.note).toBe('昨天')
    expect(checkInFor(updated, '2026-11-03')).toMatchObject({
      dateKey: '2026-11-03', note: '复习 35 个词', photo: secondPhoto, recordedAt: 1234,
    })
    expect(checkInFor(updated, '2026-11-03')?.code).toMatch(/^[0-9a-f]{7}$/)
  })

  it('完成时保存毫秒时间戳，编辑已完成记录不会刷新时间', () => {
    const row = item({ repeat: 'daily' })
    expect(recordedAtForCheckIn(row, '2026-11-03', 1234)).toBe(1234)
    const checkedIn = {
      ...row,
      doneDays: ['2026-11-03'],
      ...checkInPatch(row, '2026-11-03', { note: '', photo: null }, 1234),
    }
    expect(recordedAtForCheckIn(checkedIn, '2026-11-03', 5678)).toBe(1234)
  })

  it('查看历史按日期倒序排列，缺少真实时间的旧记录保持为空', () => {
    const row = item({
      repeat: 'daily',
      doneDays: ['2026-11-02', '2026-11-04', '2026-11-03'],
      checkIns: [
        { code: '2222222', dateKey: '2026-11-02', note: '第二天', photo: null, recordedAt: 1234 },
      ],
    })
    expect(checkInHistory(row)).toEqual([
      { code: stableCode('s1:2026-11-04'), dateKey: '2026-11-04', note: '', photo: null, recordedAt: null },
      { code: stableCode('s1:2026-11-03'), dateKey: '2026-11-03', note: '', photo: null, recordedAt: null },
      { code: '2222222', dateKey: '2026-11-02', note: '第二天', photo: null, recordedAt: 1234 },
    ])
  })

  it('撤销打卡清除时间但保留文字和照片', () => {
    const photo = { id: 'p1', dataUrl: 'data:image/jpeg;base64,AA', width: 8, height: 6 }
    const row = item({
      repeat: 'daily',
      doneDays: ['2026-11-02'],
      checkIns: [{ code: '3333333', dateKey: '2026-11-02', note: '保留内容', photo, recordedAt: 1234 }],
    })
    const undone = {
      ...row,
      ...donePatch(row, '2026-11-02', false),
      ...undoCheckInPatch(row, '2026-11-02'),
    }
    expect(checkInFor(undone, '2026-11-02')).toMatchObject({
      code: '3333333', dateKey: '2026-11-02', note: '保留内容', photo, recordedAt: null,
    })
    expect(checkInHistory(undone)).toEqual([])
  })

  it('一次性日程的历史使用完成时间戳', () => {
    const row = item({ doneAt: 1234 })
    expect(checkInHistory(row)).toEqual([
      { code: stableCode('s1:2026-11-01'), dateKey: '2026-11-01', note: '', photo: null, recordedAt: 1234 },
    ])
  })

  it('清空选中日期的内容时不动其它日期', () => {
    const row = item({ repeat: 'daily', checkIns: [
      { code: '4444444', dateKey: '2026-11-02', note: '保留', photo: null, recordedAt: 1 },
      { code: '5555555', dateKey: '2026-11-03', note: '清掉', photo: null, recordedAt: 2 },
    ] })
    expect(checkInPatch(row, '2026-11-03', null).checkIns).toEqual([
      { code: '4444444', dateKey: '2026-11-02', note: '保留', photo: null, recordedAt: 1 },
    ])
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
