import { db } from '../../core/db/db'
import type { DiaryDay, DiaryEntry, DiaryStamp } from '../../core/db/schema'
import { newCode, newId } from '../../core/utils/id'
import { formatClock } from '../../core/utils/dateKey'

/** 某一天的全部日记，按创建时间升序 */
export function entriesOfDay(dateKey: string): Promise<DiaryEntry[]> {
  return db.diaryEntries
    .where('dateKey')
    .equals(dateKey)
    .filter((entry) => entry.deletedAt === null)
    .sortBy('createdAt')
}

export function entryByCode(code: string) {
  return db.diaryEntries.where('code').equals(code).first()
}

export async function createEntry(dateKey: string): Promise<DiaryEntry> {
  const now = Date.now()
  const entry: DiaryEntry = {
    id: newId(),
    code: newCode(),
    dateKey,
    createdAt: now,
    updatedAt: now,
    content: '',
    deletedAt: null,
  }
  await db.diaryEntries.add(entry)
  return entry
}

export function updateContent(id: string, content: string) {
  return db.diaryEntries.update(id, { content, updatedAt: Date.now() })
}

/** 软删除：只打标记，可撤销 */
export function removeEntry(id: string) {
  return db.diaryEntries.update(id, { deletedAt: Date.now() })
}

/** 批量软删除，一次把选中的都打上标记 */
export async function removeEntries(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
}

export async function restoreEntries(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: null })
}

/** 批量换到另一天：记错日期时用 */
export async function moveEntries(ids: string[], dateKey: string) {
  if (ids.length === 0) return 0
  return db.diaryEntries.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
}

export function restoreEntry(id: string) {
  return db.diaryEntries.update(id, { deletedAt: null })
}

export function dayInfo(dateKey: string) {
  return db.diaryDays.get(dateKey)
}

export async function setWeather(dateKey: string, weather: string) {
  await db.diaryDays.put({ dateKey, weather, updatedAt: Date.now() })
}

/** 某一天的全部随记，按时间正序 */
export function stampsOfDay(dateKey: string): Promise<DiaryStamp[]> {
  return db.diaryStamps
    .where('dateKey')
    .equals(dateKey)
    .filter((stamp) => stamp.deletedAt === null)
    .sortBy('time')
}

/** 新记一笔：时间默认取当前时刻，之后可以点改 */
export async function addStamp(dateKey: string): Promise<DiaryStamp> {
  const now = Date.now()
  const stamp: DiaryStamp = {
    id: newId(),
    dateKey,
    time: formatClock(now),
    content: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.diaryStamps.add(stamp)
  return stamp
}

export function updateStamp(id: string, patch: { time?: string; content?: string }) {
  return db.diaryStamps.update(id, { ...patch, updatedAt: Date.now() })
}

/** 软删除：只打标记，可撤销 */
export function removeStamp(id: string) {
  return db.diaryStamps.update(id, { deletedAt: Date.now() })
}

export function restoreStamp(id: string) {
  return db.diaryStamps.update(id, { deletedAt: null })
}

/** 批量软删除随记，一次把选中的都打上标记 */
export async function removeStamps(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
}

export async function restoreStamps(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: null })
}

/** 批量把随记换到另一天：记错日期时用 */
export async function moveStamps(ids: string[], dateKey: string) {
  if (ids.length === 0) return 0
  return db.diaryStamps.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
}

/** 回收站里的日记，最近删的排前面 */
export async function trashedEntries(): Promise<DiaryEntry[]> {
  const list = await db.diaryEntries.filter((entry) => entry.deletedAt !== null).toArray()
  return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

/** 回收站里的随记，最近删的排前面 */
export async function trashedStamps(): Promise<DiaryStamp[]> {
  const list = await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).toArray()
  return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

/** 彻底删除一条日记：连记录本身一起删掉，不再有回收站兜底 */
export function purgeEntry(id: string) {
  return db.diaryEntries.delete(id)
}

export function purgeStamp(id: string) {
  return db.diaryStamps.delete(id)
}

/** 批量彻底删除：连记录本身一起删掉，没有撤销 */
export async function purgeEntries(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryEntries.where('id').anyOf(ids).delete()
}

export async function purgeStamps(ids: string[]) {
  if (ids.length === 0) return 0
  return db.diaryStamps.where('id').anyOf(ids).delete()
}

/** 清空日记的回收站：只清日记，不动随记 */
export async function purgeTrashedEntries() {
  await db.diaryEntries.filter((entry) => entry.deletedAt !== null).delete()
}

/** 清空随记的回收站：只清随记，不动日记 */
export async function purgeTrashedStamps() {
  await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).delete()
}

// ─────────── 全量备份与恢复 ───────────

/** 取全部，连回收站里的也一起取：备份不该把删掉的东西漏掉 */
export function everyEntry(): Promise<DiaryEntry[]> {
  return db.diaryEntries.toArray()
}

export function everyStamp(): Promise<DiaryStamp[]> {
  return db.diaryStamps.toArray()
}

export function everyDay(): Promise<DiaryDay[]> {
  return db.diaryDays.toArray()
}

/** 库里有几样东西（含回收站），给设置页那张卡右上角的「当前值」用 */
export async function totals() {
  const [entries, stamps] = await Promise.all([db.diaryEntries.count(), db.diaryStamps.count()])
  return { entries, stamps }
}

/** 一次导入里，每张表进来多少、其中多少条把原有的盖掉了 */
export interface ImportStats {
  entries: { total: number; overwritten: number }
  stamps: { total: number; overwritten: number }
  days: { total: number; overwritten: number }
}

/**
 * 导入一份备份。同 id 的以备份为准（bulkPut 本身就是覆盖语义）。
 * 三张表放进同一个事务：要么全成要么全不成，不会出现「日记进了一半」。
 */
export async function importBackup(data: {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  days: DiaryDay[]
}): Promise<ImportStats> {
  // 覆盖数 = 库里本来就有、这次又被备份写上来的条数
  const [oldEntries, oldStamps, oldDays] = await Promise.all([
    db.diaryEntries.bulkGet(data.entries.map((item) => item.id)),
    db.diaryStamps.bulkGet(data.stamps.map((item) => item.id)),
    db.diaryDays.bulkGet(data.days.map((item) => item.dateKey)),
  ])

  await db.transaction('rw', db.diaryEntries, db.diaryStamps, db.diaryDays, async () => {
    await db.diaryEntries.bulkPut(data.entries)
    await db.diaryStamps.bulkPut(data.stamps)
    await db.diaryDays.bulkPut(data.days)
  })

  const howMany = (list: unknown[]) => list.filter(Boolean).length
  return {
    entries: { total: data.entries.length, overwritten: howMany(oldEntries) },
    stamps: { total: data.stamps.length, overwritten: howMany(oldStamps) },
    days: { total: data.days.length, overwritten: howMany(oldDays) },
  }
}
