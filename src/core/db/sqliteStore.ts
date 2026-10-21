/**
 * `DiaryStore` 的 SQLite 实现（桌面端）。
 *
 * 真正的数据库在主进程（`electron/database.cjs`），这里只负责把契约里的方法
 * 翻译成一次 IPC 调用。id / 时间戳沿用和 Dexie 实现同一套生成逻辑，
 * 保证两种后端写出来的数据形状完全一致。
 */
import { desktopBridge } from '@/platform/desktop'
import { formatClock } from '@/core/utils/dateKey'
import { newCode, newId } from '@/core/utils/id'
import type { DiaryEntry, DiaryStamp } from './schema'
import type { DiaryStore } from './store'

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const db = desktopBridge()?.db
  if (!db) return Promise.reject(new Error('桌面的本地数据库通道还没准备好'))
  return db.call(method, args) as Promise<T>
}

export const sqliteStore: DiaryStore = {
  // ─────────── 日记 ───────────
  entriesOfDay: (dateKey) => call('entriesOfDay', dateKey),
  entryByCode: (code) => call('entryByCode', code),

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
    await call('insertEntry', entry)
    return entry
  },

  updateContent: async (id, content) => {
    await call('updateContent', id, content)
  },
  removeEntry: async (id) => {
    await call('removeEntry', id)
  },
  removeEntries: (ids) => call('removeEntries', ids),
  restoreEntry: async (id) => {
    await call('restoreEntry', id)
  },
  restoreEntries: (ids) => call('restoreEntries', ids),
  moveEntries: (ids, dateKey) => call('moveEntries', ids, dateKey),

  // ─────────── 某天的信息 ───────────
  dayInfo: (dateKey) => call('dayInfo', dateKey),
  setWeather: async (dateKey, weather) => {
    await call('setWeather', dateKey, weather)
  },

  // ─────────── 随记 ───────────
  stampsOfDay: (dateKey) => call('stampsOfDay', dateKey),

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
    await call('insertStamp', stamp)
    return stamp
  },

  updateStamp: async (id, patch) => {
    await call('updateStamp', id, patch)
  },
  removeStamp: async (id) => {
    await call('removeStamp', id)
  },
  restoreStamp: async (id) => {
    await call('restoreStamp', id)
  },
  removeStamps: (ids) => call('removeStamps', ids),
  restoreStamps: (ids) => call('restoreStamps', ids),
  moveStamps: (ids, dateKey) => call('moveStamps', ids, dateKey),

  // ─────────── 回收站 ───────────
  trashedEntries: () => call('trashedEntries'),
  trashedStamps: () => call('trashedStamps'),
  purgeEntry: async (id) => {
    await call('purgeEntry', id)
  },
  purgeStamp: async (id) => {
    await call('purgeStamp', id)
  },
  purgeEntries: (ids) => call('purgeEntries', ids),
  purgeStamps: (ids) => call('purgeStamps', ids),
  purgeTrashedEntries: async () => {
    await call('purgeTrashedEntries')
  },
  purgeTrashedStamps: async () => {
    await call('purgeTrashedStamps')
  },

  // ─────────── 备份 ───────────
  everyEntry: () => call('everyEntry'),
  everyStamp: () => call('everyStamp'),
  everyDay: () => call('everyDay'),
  totals: () => call('totals'),
  importBackup: (data) => call('importBackup', data),
}
