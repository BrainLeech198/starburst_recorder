/**
 * 桌面端（SQLite）的分块导入：导出 → 原样写回，记录必须一字不差。
 *
 * 0.5.0 之前的 `writeSections` 漏绑了 images 列，替换导入直接炸在
 * NOT NULL constraint failed: diaryEntries.images；只导随记时参数整体错位，
 * 图片被写成时间戳。这层测试盯的就是「绑定参数与 SQL 列数对不齐」这类毛病。
 */
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiaryEntry, DiaryImage, DiaryStamp } from './schema'

const require = createRequire(import.meta.url)
const { createDatabase } = require('../../../electron/database.cjs') as {
  createDatabase: (file: string) => {
    call: (method: string, args: unknown[]) => unknown
    close: () => void
  }
}

const image: DiaryImage = {
  id: 'img1',
  dataUrl: 'data:image/png;base64,AAAA',
  width: 10,
  height: 10,
}

const entry: DiaryEntry = {
  id: 'e1',
  code: 'E000001',
  dateKey: '2026-10-30',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  content: '日记 [[img:img1]]',
  images: [image],
  deletedAt: null,
}

const stamp: DiaryStamp = {
  id: 's1',
  code: 'S000001',
  dateKey: '2026-10-30',
  time: '08:00',
  content: '随记 [[img:img1]]',
  images: [image],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
}

let dir = ''
let db: ReturnType<typeof createDatabase>

function call<T>(method: string, ...args: unknown[]): T {
  return db.call(method, args) as T
}

function exportAll() {
  return call<{ entries: DiaryEntry[]; stamps: DiaryStamp[] }>('exportAllData')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'starburst-import-'))
  db = createDatabase(join(dir, 'test.sqlite'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('桌面端 SQLite 分块导入', () => {
  it('替换导入保留日记与随记的图片', () => {
    call('insertEntry', entry)
    call('insertStamp', stamp)
    const before = exportAll()

    call('replaceSections', {
      diary: { entries: before.entries, stamps: before.stamps, days: [], presets: [] },
    })

    const after = exportAll()
    expect(after.entries[0].images).toEqual([image])
    expect(after.stamps[0].images).toEqual([image])
    expect(after.entries[0].content).toBe(entry.content)
    expect(after.stamps[0].content).toBe(stamp.content)
    expect(after.stamps[0].updatedAt).toBe(stamp.updatedAt)
  })

  it('只导随记时不会把参数错位写进图片列', () => {
    call('insertStamp', stamp)
    const before = exportAll()

    call('replaceSections', { diary: { entries: [], stamps: before.stamps, days: [], presets: [] } })

    const after = exportAll()
    expect(after.stamps[0].images).toEqual([image])
    expect(after.stamps[0].createdAt).toBe(stamp.createdAt)
    expect(after.stamps[0].deletedAt).toBeNull()
  })

  it('合并导入同样保留图片，回收站里的行也不例外', () => {
    const trashed = { ...entry, id: 'e2', code: 'E000002', deletedAt: 1_700_000_001_000 }
    call('insertEntry', entry)

    call('importSections', {
      diary: { entries: [entry, trashed], stamps: [stamp], days: [], presets: [] },
    })

    const after = exportAll()
    const byId = new Map(after.entries.map((row) => [row.id, row]))
    expect(byId.get('e1')?.images).toEqual([image])
    expect(byId.get('e2')?.images).toEqual([image])
    expect(byId.get('e2')?.deletedAt).toBe(trashed.deletedAt)
    expect(after.stamps[0].images).toEqual([image])
  })

  it('健康分块往返后照片与字段都还在', () => {
    call('saveHealthFood', {
      id: 'f1',
      code: 'F000001',
      name: '米饭',
      kcal: 116,
      protein: 2.6,
      carbs: 25.9,
      fat: 0.3,
      servingName: '碗',
      servingGrams: 150,
      photo: 'data:image/png;base64,BBBB',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    })
    const before = call<{
      profile: unknown
      foods: unknown[]
      meals: unknown[]
      intakes: unknown[]
      sleeps: unknown[]
    }>('exportAllData')

    call('replaceSections', {
      health: {
        profile: null,
        foods: before.foods,
        meals: before.meals,
        intakes: before.intakes,
        sleeps: before.sleeps,
      },
    })

    const after = call<{ foods: Array<{ photo: string | null }> }>('exportAllData')
    expect(after.foods[0].photo).toBe('data:image/png;base64,BBBB')
  })
})
