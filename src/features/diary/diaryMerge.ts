/**
 * 导入备份时的冲突判定。
 *
 * 同一 id / 同一天在两边都存在、但内容不一样，就算一处冲突——交给用户自己选留哪边，
 * 而不是偷偷用某一边覆盖另一边。以前是「备份无条件覆盖」，结果是本地刚写的日记
 * 会被一份上个月的备份盖掉，而且导入后才发现，找不回来。
 *
 * 这里只做纯计算，不碰数据库：输入是「备份里的数据」和「当前库里的数据」，
 * 输出是一串冲突描述 + 一个按用户选择剔除冲突项的函数。这样能单独测。
 */
import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'
import type { BackupPayload } from './diaryBackup'

export type ConflictKind = 'entry' | 'stamp' | 'day'

export interface MergeConflict {
  kind: ConflictKind
  /** 记录的主键：日记/随记是 id，某天是 dateKey */
  key: string
  /** 弹窗里一行显示的标题，例如「2026-10-20 · 08:30」 */
  label: string
  /** 本地这边的内容摘要 */
  localText: string
  /** 备份这边的内容摘要 */
  incomingText: string
  localAt: number
  incomingAt: number
}

/** 冲突项的唯一键：三张表可能各自有同名的 key，得带上类型 */
export function conflictKey(conflict: Pick<MergeConflict, 'kind' | 'key'>) {
  return `${conflict.kind}:${conflict.key}`
}

const SNIPPET_MAX = 48

function snippet(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return ''
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX)}…` : flat
}

/** 删掉的条目也算不同：一件事「在回收站」和「没删」不能当成同一条 */
function tombstone(value: number | null) {
  return value === null || value === undefined ? 'alive' : 'gone'
}

function entryDiffers(local: DiaryEntry, incoming: DiaryEntry) {
  return (
    local.content !== incoming.content ||
    local.dateKey !== incoming.dateKey ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function stampDiffers(local: DiaryStamp, incoming: DiaryStamp) {
  return (
    local.content !== incoming.content ||
    local.time !== incoming.time ||
    local.dateKey !== incoming.dateKey ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function dayDiffers(local: DiaryDay, incoming: DiaryDay) {
  return local.weather !== incoming.weather
}

/**
 * 找出所有冲突。内容完全一样的条目不算冲突——导入它本来也不改变任何东西。
 * 只在本地存在／只在备份存在的条目也都不算，那些是「纯新增」或「不受影响」。
 */
export function findConflicts(incoming: BackupPayload, local: BackupPayload): MergeConflict[] {
  const conflicts: MergeConflict[] = []

  const localEntries = new Map(local.entries.map((item) => [item.id, item]))
  for (const item of incoming.entries) {
    const mine = localEntries.get(item.id)
    if (!mine || !entryDiffers(mine, item)) continue
    conflicts.push({
      kind: 'entry',
      key: item.id,
      label: item.dateKey,
      localText: snippet(mine.content),
      incomingText: snippet(item.content),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localStamps = new Map(local.stamps.map((item) => [item.id, item]))
  for (const item of incoming.stamps) {
    const mine = localStamps.get(item.id)
    if (!mine || !stampDiffers(mine, item)) continue
    conflicts.push({
      kind: 'stamp',
      key: item.id,
      label: `${item.dateKey} · ${item.time}`,
      localText: snippet(mine.content),
      incomingText: snippet(item.content),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localDays = new Map(local.days.map((item) => [item.dateKey, item]))
  for (const item of incoming.days) {
    const mine = localDays.get(item.dateKey)
    if (!mine || !dayDiffers(mine, item)) continue
    conflicts.push({
      kind: 'day',
      key: item.dateKey,
      label: item.dateKey,
      localText: mine.weather ?? '',
      incomingText: item.weather ?? '',
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  return conflicts
}

/**
 * 按用户的选择把「保留本地」的那些从备份里剔掉，剩下的才会真正写进库。
 * 没被选进 keepLocal 的冲突项就按备份的版本写——那是用户明确选的。
 */
export function pickIncoming(
  incoming: BackupPayload,
  keepLocal: Set<string>,
): BackupPayload {
  if (keepLocal.size === 0) return incoming
  return {
    entries: incoming.entries.filter((item) => !keepLocal.has(conflictKey({ kind: 'entry', key: item.id }))),
    stamps: incoming.stamps.filter((item) => !keepLocal.has(conflictKey({ kind: 'stamp', key: item.id }))),
    days: incoming.days.filter((item) => !keepLocal.has(conflictKey({ kind: 'day', key: item.dateKey }))),
  }
}
