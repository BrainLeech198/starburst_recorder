/**
 * 端到端合并场景：模拟整个导入决策链路，找交互逻辑里的边角 bug。
 *
 * 真实数据链路是：readBackup → findConflicts → 用户选 keepLocal → pickIncoming → importBackup
 * 这里把每一段接起来测，不只测单个纯函数。
 */
import { describe, expect, it } from 'vitest'
import { buildBackup, readBackup } from './diaryBackup'
import type { BackupPayload } from './diaryBackup'
import { findConflicts, pickIncoming } from './diaryMerge'
import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'

const mkEntry = (id: string, content: string, dateKey = '2026-10-23', opts?: Partial<DiaryEntry>): DiaryEntry => ({
  id, code: id.padEnd(7, '0'), dateKey, createdAt: 100, updatedAt: 100, content, deletedAt: null, ...opts,
})
const mkStamp = (id: string, content: string, dateKey = '2026-10-23', time = '08:00', opts?: Partial<DiaryStamp>): DiaryStamp => ({
  id, dateKey, time, content, createdAt: 100, updatedAt: 100, deletedAt: null, ...opts,
})
const mkDay = (dateKey: string, weather: string | null): DiaryDay => ({ dateKey, weather, updatedAt: 100 })

function scenario(local: Partial<BackupPayload>, incoming: Partial<BackupPayload>) {
  const fill = (p: Partial<BackupPayload>): BackupPayload => ({
    entries: [],
    stamps: [],
    days: [],
    ...p,
  })
  return { local: fill(local), incoming: fill(incoming) }
}

describe('端到端合并链路', () => {
  it('空本地 → 零冲突 → 全部导入', () => {
    const { local, incoming } = scenario(
      { entries: [], stamps: [], days: [] },
      { entries: [mkEntry('e1', 'A')], stamps: [mkStamp('s1', 'S')], days: [mkDay('2026-10-23', '晴')] },
    )
    const conflicts = findConflicts(incoming, local)
    expect(conflicts).toHaveLength(0)
    const final = pickIncoming(incoming, new Set())
    expect(final.entries).toHaveLength(1)
    expect(final.stamps).toHaveLength(1)
    expect(final.days).toHaveLength(1)
  })

  it('备份没有、本地独有 → 不冲突、不受影响', () => {
    const { local, incoming } = scenario(
      { entries: [mkEntry('only-local', '本地独有的内容')], stamps: [], days: [] },
      { entries: [mkEntry('only-incoming', '备份独有的内容')], stamps: [], days: [] },
    )
    const conflicts = findConflicts(incoming, local)
    expect(conflicts).toHaveLength(0)
    const final = pickIncoming(incoming, new Set())
    // 只有 incoming 那一条会被导入，本地独有的不会被 importBackup 触碰到（它根本看不到）
    expect(final.entries).toEqual([incoming.entries[0]])
  })

  it('全部冲突、全部选本地 → final 为空数组', () => {
    const { local, incoming } = scenario(
      { entries: [mkEntry('e1', '本地')], stamps: [mkStamp('s1', '本地')], days: [mkDay('2026-10-23', '晴')] },
      { entries: [mkEntry('e1', '备份')], stamps: [mkStamp('s1', '备份')], days: [mkDay('2026-10-23', '阴')] },
    )
    const conflicts = findConflicts(incoming, local)
    expect(conflicts).toHaveLength(3)
    const keepAll = new Set(conflicts.map((c) => `${c.kind}:${c.key}`))
    const final = pickIncoming(incoming, keepAll)
    expect(final.entries).toEqual([])
    expect(final.stamps).toEqual([])
    expect(final.days).toEqual([])
  })

  it('全部冲突、全部选备份 → final 等于原备份', () => {
    const { local, incoming } = scenario(
      { entries: [mkEntry('e1', '本地')], stamps: [], days: [] },
      { entries: [mkEntry('e1', '备份')], stamps: [], days: [] },
    )
    expect(findConflicts(incoming, local).length).toBe(1)
    const final = pickIncoming(incoming, new Set())
    expect(final).toEqual(incoming)
  })

  it('混合场景：部分冲突选本地、部分选备份', () => {
    const { local, incoming } = scenario(
      {
        entries: [mkEntry('A', '本地A'), mkEntry('B', '本地B')],
        stamps: [mkStamp('X', '本地X')],
        days: [mkDay('2026-10-23', '晴')],
      },
      {
        entries: [mkEntry('A', '备份A'), mkEntry('B', '备份B')],
        stamps: [mkStamp('X', '备份X')],
        days: [mkDay('2026-10-23', '阴')],
      },
    )
    expect(findConflicts(incoming, local).length).toBe(4)
    // 选 A 和 X 保留本地，B 和 day 用备份
    const keepLocal = new Set(['entry:A', 'stamp:X'])
    const final = pickIncoming(incoming, keepLocal)
    // A 被剔除、B 保留
    expect(final.entries.map((e) => e.id)).toEqual(['B'])
    // X 被剔除
    expect(final.stamps).toEqual([])
    // day 保留
    expect(final.days).toEqual(incoming.days)
  })

  it('只有 updatedAt 变、内容没变 → 不算冲突', () => {
    const { local, incoming } = scenario(
      { entries: [mkEntry('e1', 'same content', '2026-10-23', { updatedAt: 100 })] },
      { entries: [mkEntry('e1', 'same content', '2026-10-23', { updatedAt: 9999 })] },
    )
    const conflicts = findConflicts(incoming, local)
    expect(conflicts).toHaveLength(0)
  })
})

describe('导入文件读取校验链路', () => {
  it('备份 → buildBackup → readBackup 是 round-trip', () => {
    const payload: BackupPayload = {
      entries: [mkEntry('e1', 'test entry')],
      stamps: [mkStamp('s1', 'test stamp')],
      days: [mkDay('2026-10-23', '晴')],
    }
    const file = buildBackup(payload)
    const result = readBackup(file.content)
    expect(result.ok).toBe(true)
    expect(result.payload).toEqual(payload)
    expect(result.skipped).toBe(0)
  })

  it('备份中 content 为空字符串是合法的', () => {
    const file = buildBackup({
      entries: [mkEntry('e1', '')],
      stamps: [mkStamp('s1', '')],
      days: [mkDay('2026-10-23', null)],
    })
    const result = readBackup(file.content)
    expect(result.ok).toBe(true)
    expect(result.payload.entries[0].content).toBe('')
    expect(result.payload.days[0].weather).toBe('') // null 会被 text() 退回成 ''
  })
})

describe('真实的本地 + 备份交叉场景（模拟用户浏览器 → 桌面迁移）', () => {
  it('场景：浏览器写了 3 条日记 + 2 笔随记；桌面写了 2 条（其中 1 条 id 撞）', () => {
    // 桌面现有
    const local: BackupPayload = {
      entries: [mkEntry('L1', '桌面独有的一条'), mkEntry('SHARED', '桌面改了 SHARED')],
      stamps: [mkStamp('LS1', '桌面独有的随记')],
      days: [],
    }
    // 浏览器导出
    const incoming: BackupPayload = {
      entries: [mkEntry('B1', '浏览器独有的一条'), mkEntry('SHARED', '浏览器改了 SHARED')],
      stamps: [mkStamp('BS1', '浏览器独有的随记'), mkStamp('SHARED-S', '浏览器共享随记')],
      days: [mkDay('2026-10-23', '多云')],
    }

    const conflicts = findConflicts(incoming, local)
    expect(conflicts.map((c) => `${c.kind}:${c.key}`).sort()).toEqual(['entry:SHARED'])

    // 用户选：SHARED 保留桌面（本地）
    const keepLocal = new Set(['entry:SHARED'])
    const final = pickIncoming(incoming, keepLocal)

    // 要导入的：B1（浏览器独有的）、BS1、SHARED-S、days[0]
    expect(final.entries.map((e) => e.id)).toEqual(['B1'])
    expect(final.stamps.map((s) => s.id)).toEqual(['BS1', 'SHARED-S'])
    expect(final.days).toHaveLength(1)

    // 导入后 L1 和 SHARED（本地版本）应该还在库里；B1 新加；SHARED-S 新加
  })
})
