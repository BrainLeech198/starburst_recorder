import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { DiaryDay, DiaryEntry, DiaryStamp } from './schema'

export const db = new Dexie('starburst') as Dexie & {
  diaryEntries: EntityTable<DiaryEntry, 'id'>
  diaryDays: EntityTable<DiaryDay, 'dateKey'>
  diaryStamps: EntityTable<DiaryStamp, 'id'>
}

db.version(1).stores({
  diaryEntries: 'id, code, dateKey, createdAt, deletedAt',
  diaryDays: 'dateKey, updatedAt',
})

// 随记：一天多笔，按 time 升序取用
db.version(2).stores({
  diaryStamps: 'id, dateKey, time, createdAt, deletedAt',
})
