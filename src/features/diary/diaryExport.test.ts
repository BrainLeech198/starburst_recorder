import { describe, expect, it } from 'vitest'
import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'
import { formatShortStamp } from '@/core/utils/dateKey'
import { buildExport, pickInRange } from './diaryExport'

function entry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'e1',
    code: 'a000001',
    dateKey: '2026-10-26',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    content: '今天去了公园。',
    deletedAt: null,
    ...overrides,
  }
}

function stamp(overrides: Partial<DiaryStamp> = {}): DiaryStamp {
  return {
    id: 's1',
    dateKey: '2026-10-26',
    time: '09:30',
    content: '晒了太阳。',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function day(overrides: Partial<DiaryDay> = {}): DiaryDay {
  return {
    dateKey: '2026-10-26',
    weather: '晴→雨',
    updatedAt: 1790000000000,
    ...overrides,
  }
}

describe('buildExport 的附加信息', () => {
  it('打开天气时，在日期下面写一行天气', () => {
    const file = buildExport([entry()], [], 'markdown', [day()], { includeWeather: true })
    expect(file.content).toContain('天气：晴转雨')
  })

  it('关掉天气时不写天气行', () => {
    const file = buildExport([entry()], [], 'markdown', [day()], { includeWeather: false })
    expect(file.content).not.toContain('天气：')
  })

  it('打开时间戳时，写出创建与编辑时间', () => {
    const item = entry({ createdAt: 1790000000000, updatedAt: 1790003600000 })
    const file = buildExport([item], [], 'markdown', [], { includeTimestamps: true })
    expect(file.content).toContain(`创建 ${formatShortStamp(item.createdAt)}`)
    expect(file.content).toContain(`编辑 ${formatShortStamp(item.updatedAt)}`)
  })

  it('默认不带时间戳', () => {
    const file = buildExport([entry()], [], 'markdown', [])
    expect(file.content).not.toContain('创建 ')
  })

  it('JSON 带上 days，保留完整字段', () => {
    const file = buildExport([entry()], [stamp()], 'json', [day()])
    const data = JSON.parse(file.content)
    expect(data.entries[0].createdAt).toBe(1790000000000)
    expect(data.days).toEqual([day()])
  })
})

describe('pickInRange', () => {
  it('只留下区间内且没被软删除的条目', () => {
    const items = [
      entry({ id: 'a', dateKey: '2026-10-19' }),
      entry({ id: 'b', dateKey: '2026-10-20' }),
      entry({ id: 'c', dateKey: '2026-10-26' }),
      entry({ id: 'd', dateKey: '2026-10-27' }),
      entry({ id: 'e', dateKey: '2026-10-22', deletedAt: 1 }),
    ]
    expect(pickInRange(items, '2026-10-20', '2026-10-26').map((item) => item.id)).toEqual([
      'b',
      'c',
    ])
  })

  it('区间两端都算在内', () => {
    const items = [entry({ id: 'a', dateKey: '2026-10-20' }), entry({ id: 'b', dateKey: '2026-10-26' })]
    expect(pickInRange(items, '2026-10-20', '2026-10-26')).toHaveLength(2)
  })
})
