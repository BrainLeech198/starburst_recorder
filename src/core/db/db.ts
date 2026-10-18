import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { DiaryDay, DiaryEntry } from './schema'

export const db = new Dexie('starburst') as Dexie & {
  diaryEntries: EntityTable<DiaryEntry, 'id'>
  diaryDays: EntityTable<DiaryDay, 'dateKey'>
}

db.version(1).stores({
  diaryEntries: 'id, code, dateKey, createdAt, deletedAt',
  diaryDays: 'dateKey, updatedAt',
})
