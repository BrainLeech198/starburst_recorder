import { describe, expect, it } from 'vitest'
import { findConflicts, pickIncoming } from './diaryMerge'
import type { BackupPayload } from './diaryBackup'
import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'

const entry = (id: string, content: string, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id,
  code: id.padEnd(7, '0'),
  dateKey: '2026-10-23',
  createdAt: 100,
  updatedAt: 100,
  content,
  deletedAt: null,
  ...extra,
})

const stamp = (id: string, content: string, extra: Partial<DiaryStamp> = {}): DiaryStamp => ({
  id,
  dateKey: '2026-10-23',
  time: '08:00',
  content,
  createdAt: 100,
  updatedAt: 100,
  deletedAt: null,
  ...extra,
})

const day = (dateKey: string, weather: string | null): DiaryDay => ({
  dateKey,
  weather,
  updatedAt: 100,
})

function conflictsOf(incoming: Partial<BackupPayload>, local: Partial<BackupPayload>) {
  const fill = (part: Partial<BackupPayload>): BackupPayload => ({
    entries: [],
    stamps: [],
    days: [],
    ...part,
  })
  return findConflicts(fill(incoming), fill(local))
}

describe('findConflicts', () => {
  it('本地没有这条 → 不算冲突', () => {
    expect(conflictsOf({ entries: [entry('a', '备份内容')] }, {})).toHaveLength(0)
  })

  it('两边内容一样 → 不算冲突，导入了也不变', () => {
    expect(conflictsOf({ entries: [entry('a', '一样')] }, { entries: [entry('a', '一样')] })).toHaveLength(0)
  })

  it('内容不一样 → 一处冲突，记下两边的内容', () => {
    const found = conflictsOf({ entries: [entry('a', '备份改了')] }, { entries: [entry('a', '本地原内容')] })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'entry', key: 'a', localText: '本地原内容', incomingText: '备份改了' })
  })

  it('删除状态不一样也算冲突', () => {
    const found = conflictsOf(
      { entries: [entry('a', '一样', { deletedAt: 999 })] },
      { entries: [entry('a', '一样')] },
    )
    expect(found).toHaveLength(1)
  })

  it('三类表各认一处', () => {
    const found = conflictsOf(
      {
        entries: [entry('e1', 'e-in')],
        stamps: [stamp('s1', 's-in')],
        days: [day('2026-10-23', '晴')],
      },
      {
        entries: [entry('e1', 'e-lo')],
        stamps: [stamp('s1', 's-lo')],
        days: [day('2026-10-23', '阴')],
      },
    )
    expect(found.map((item) => item.kind)).toEqual(['entry', 'stamp', 'day'])
  })
})

describe('pickIncoming', () => {
  const base: BackupPayload = {
    entries: [entry('a', 'A'), entry('b', 'B')],
    stamps: [stamp('s1', 'S1'), stamp('s2', 'S2')],
    days: [day('2026-10-22', '晴'), day('2026-10-23', '阴')],
  }

  it('一个都不保留 → 原样导入', () => {
    const result = pickIncoming(base, new Set())
    expect(result.entries).toEqual(base.entries)
    expect(result.stamps).toEqual(base.stamps)
    expect(result.days).toEqual(base.days)
  })

  it('选了几个保留本地 → 这几条从导入列表里剔掉', () => {
    const result = pickIncoming(base, new Set(['entry:b', 'stamp:s1', 'day:2026-10-22']))
    expect(result.entries.map((item) => item.id)).toEqual(['a'])
    expect(result.stamps.map((item) => item.id)).toEqual(['s2'])
    expect(result.days.map((item) => item.dateKey)).toEqual(['2026-10-23'])
  })
})
