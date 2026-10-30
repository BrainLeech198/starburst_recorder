import { describe, expect, it } from 'vitest'
import { buildBackup, emptyPayload, readBackup } from './diaryBackup'
import type { BackupPayload } from './diaryBackup'

function sample(): BackupPayload {
  return {
    ...emptyPayload(),
    entries: [
      {
        id: 'e1',
        code: 'a1b2c3d',
        dateKey: '2026-10-25',
        content: '今天在公园走了三公里。',
        images: [],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    stamps: [
      {
        id: 's1',
        code: 'd4e5f60',
        dateKey: '2026-10-25',
        time: '09:30',
        content: '早上去公园散步。',
        images: [],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
  }
}

describe('备份读写的兼容口径', () => {
  it('自己导出的自己一定读得回来', () => {
    const file = buildBackup(sample())
    const read = readBackup(file.content)
    expect(read.ok).toBe(true)
    expect(read.payload.entries).toHaveLength(1)
    expect(read.payload.stamps).toHaveLength(1)
    expect(read.payload.entries[0].content).toBe('今天在公园走了三公里。')
    expect(read.payload.stamps[0].code).toBe('d4e5f60')
  })

  it('导出的文件带上两个版本号，方便以后定位', () => {
    const parsed = JSON.parse(buildBackup(sample()).content) as Record<string, unknown>
    expect(parsed.app).toBe('starburst-recorder')
    expect(parsed.version).toBe(2)
    expect(parsed.schemaVersion).toBe(2)
  })

  it('v1 那种扁平摆法照样读得出来', () => {
    const legacy = JSON.stringify({
      app: 'starburst-recorder',
      version: 1,
      entries: [{ id: 'e1', dateKey: '2026-10-25', content: '旧版的一条' }],
    })
    const read = readBackup(legacy)
    expect(read.ok).toBe(true)
    expect(read.payload.entries[0].content).toBe('旧版的一条')
  })

  it('版本号看不懂也照样读：只认字段，不认版本', () => {
    const future = JSON.stringify({
      app: 'starburst-recorder',
      version: 99,
      schemaVersion: 99,
      totallyUnknownTopLevel: { anything: true },
      sections: {
        diary: {
          entries: [{ id: 'e1', dateKey: '2026-10-25', content: '还在', brandNewField: 1 }],
        },
      },
    })
    const read = readBackup(future)
    expect(read.ok).toBe(true)
    expect(read.payload.entries[0].content).toBe('还在')
    expect('brandNewField' in (read.payload.entries[0] as object)).toBe(false)
  })

  it('写坏的日期不进库：2026-13-40 这种会静默污染统计', () => {
    const broken = JSON.stringify({
      app: 'starburst-recorder',
      version: 2,
      sections: {
        diary: {
          entries: [
            { id: 'good', dateKey: '2026-10-25', content: '好的' },
            { id: 'bad', dateKey: '2026-13-40', content: '坏日期' },
          ],
        },
      },
    })
    const read = readBackup(broken)
    expect(read.ok).toBe(true)
    expect(read.payload.entries).toHaveLength(1)
    expect(read.payload.entries[0].id).toBe('good')
    expect(read.skipped).toBeGreaterThan(0)
  })

  it('整份都认不出来时说人话，不抛异常', () => {
    expect(readBackup('not json at all').ok).toBe(false)
    expect(readBackup('[]').ok).toBe(false)
    expect(readBackup('{}').ok).toBe(false)
  })
})
