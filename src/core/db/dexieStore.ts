/**
 * `DiaryStore` 的 Dexie / IndexedDB 实现。
 *
 * 这是目前唯一碰数据库的地方。换存储时保留这个文件作为对照，
 * 再按 `store.ts` 的契约写一份新的实现即可。
 */
import { db } from './db'
import type { DiaryEntry, DiaryStamp } from './schema'
import type { DiaryStore, ImportStats } from './store'
import { newCode, newId } from '@/core/utils/id'
import { formatClock } from '@/core/utils/dateKey'

export const dexieStore: DiaryStore = {
  entriesOfDay(dateKey) {
    return db.diaryEntries
      .where('dateKey')
      .equals(dateKey)
      .filter((entry) => entry.deletedAt === null)
      .sortBy('createdAt')
  },

  entryByCode(code) {
    return db.diaryEntries.where('code').equals(code).first()
  },

  async createEntry(dateKey) {
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
  },

  async updateContent(id, content) {
    await db.diaryEntries.update(id, { content, updatedAt: Date.now() })
  },

  async removeEntry(id) {
    await db.diaryEntries.update(id, { deletedAt: Date.now() })
  },

  async removeEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreEntry(id) {
    await db.diaryEntries.update(id, { deletedAt: null })
  },

  async restoreEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async moveEntries(ids, dateKey) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
  },

  dayInfo(dateKey) {
    return db.diaryDays.get(dateKey)
  },

  async setWeather(dateKey, weather) {
    await db.diaryDays.put({ dateKey, weather, updatedAt: Date.now() })
  },

  stampsOfDay(dateKey) {
    return db.diaryStamps
      .where('dateKey')
      .equals(dateKey)
      .filter((stamp) => stamp.deletedAt === null)
      .sortBy('time')
  },

  async addStamp(dateKey) {
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
  },

  async updateStamp(id, patch) {
    await db.diaryStamps.update(id, { ...patch, updatedAt: Date.now() })
  },

  async removeStamp(id) {
    await db.diaryStamps.update(id, { deletedAt: Date.now() })
  },

  async restoreStamp(id) {
    await db.diaryStamps.update(id, { deletedAt: null })
  },

  async removeStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async moveStamps(ids, dateKey) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
  },

  async trashedEntries() {
    const list = await db.diaryEntries
      .filter((entry) => entry.deletedAt !== null)
      .toArray()
    return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async trashedStamps() {
    const list = await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).toArray()
    return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeEntry(id) {
    await db.diaryEntries.delete(id)
  },

  async purgeStamp(id) {
    await db.diaryStamps.delete(id)
  },

  async purgeEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).delete()
  },

  async purgeStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).delete()
  },

  async purgeTrashedEntries() {
    await db.diaryEntries.filter((entry) => entry.deletedAt !== null).delete()
  },

  async purgeTrashedStamps() {
    await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).delete()
  },

  everyEntry() {
    return db.diaryEntries.toArray()
  },

  everyStamp() {
    return db.diaryStamps.toArray()
  },

  everyDay() {
    return db.diaryDays.toArray()
  },

  async totals() {
    const [entries, stamps] = await Promise.all([db.diaryEntries.count(), db.diaryStamps.count()])
    return { entries, stamps }
  },

  async importBackup(data): Promise<ImportStats> {
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
  },
}
