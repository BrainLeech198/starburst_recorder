/**
 * 业务层看到的数据入口。
 *
 * 页面只 import 这里的函数；底下是 Dexie 还是 SQLite，由 `core/db/index.ts` 选。
 * 换存储时这里的名字和签名保持不变，调用方一行都不用改。
 */
import { store } from '../../core/db'

export const {
  // 日记
  entriesOfDay,
  entryByCode,
  createEntry,
  updateContent,
  removeEntry,
  removeEntries,
  restoreEntry,
  restoreEntries,
  moveEntries,
  // 某天的信息
  dayInfo,
  setWeather,
  // 随记
  stampsOfDay,
  addStamp,
  updateStamp,
  removeStamp,
  restoreStamp,
  removeStamps,
  restoreStamps,
  moveStamps,
  // 回收站
  trashedEntries,
  trashedStamps,
  purgeEntry,
  purgeStamp,
  purgeEntries,
  purgeStamps,
  purgeTrashedEntries,
  purgeTrashedStamps,
  // 备份与恢复
  everyEntry,
  everyStamp,
  everyDay,
  totals,
  importBackup,
} = store

export type { ImportStats } from '../../core/db/store'
