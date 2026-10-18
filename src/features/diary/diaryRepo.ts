import { db } from '../../core/db/db'
import type { DiaryEntry } from '../../core/db/schema'
import { newCode, newId } from '../../core/utils/id'

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

/** 软删除：只打标记，可撤销 / 可在回收站恢复 */
export function removeEntry(id: string) {
  return db.diaryEntries.update(id, { deletedAt: Date.now() })
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
