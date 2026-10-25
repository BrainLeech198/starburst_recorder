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
import type {
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  HealthFood,
  HealthMeal,
  HealthProfile,
} from './schema'
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

  // ─────────── 预设库 ───────────
  diaryPresets: () => call('diaryPresets'),
  trashedDiaryPresets: () => call('trashedDiaryPresets'),
  saveDiaryPreset: async (preset) => {
    const next: DiaryPreset = { ...preset, updatedAt: Date.now() }
    await call('saveDiaryPreset', next)
    return next
  },
  removeDiaryPreset: async (id) => {
    await call('removeDiaryPreset', id)
  },
  removeDiaryPresets: (ids) => call('removeDiaryPresets', ids),
  restoreDiaryPreset: async (id) => {
    await call('restoreDiaryPreset', id)
  },
  restoreDiaryPresets: (ids) => call('restoreDiaryPresets', ids),
  purgeDiaryPreset: async (id) => {
    await call('purgeDiaryPreset', id)
  },
  purgeTrashedDiaryPresets: async () => {
    await call('purgeTrashedDiaryPresets')
  },

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
  exportAllData: () => call('exportAllData'),
  importSections: (data) => call('importSections', data),
  replaceSections: (data) => call('replaceSections', data),
  importBackup: (data) => call('importBackup', data),
  clearDiaryData: () => call('clearDiaryData'),
  clearHealthData: () => call('clearHealthData'),
  clearFinanceData: () => call('clearFinanceData'),
  trashDiaryData: () => call('trashDiaryData'),
  trashHealthData: () => call('trashHealthData'),
  trashFinanceData: () => call('trashFinanceData'),

  // ─────────── 健康 ───────────
  healthProfile: () => call('healthProfile'),
  saveHealthProfile: async (profile) => {
    const next: HealthProfile = { ...profile, id: 'me', updatedAt: Date.now() }
    await call('saveHealthProfile', next)
    return next
  },
  healthFoods: () => call('healthFoods'),
  saveHealthFood: async (food) => {
    const next: HealthFood = { ...food, updatedAt: Date.now() }
    await call('saveHealthFood', next)
    return next
  },
  mergeHealthFoods: (sourceId, targetId) => call('mergeHealthFoods', sourceId, targetId),
  removeHealthFood: async (id) => {
    await call('removeHealthFood', id)
  },
  removeHealthFoods: (ids) => call('removeHealthFoods', ids),
  trashedHealthFoods: () => call('trashedHealthFoods'),
  restoreHealthFood: async (id) => {
    await call('restoreHealthFood', id)
  },
  restoreHealthFoods: (ids) => call('restoreHealthFoods', ids),
  purgeHealthFood: async (id) => {
    await call('purgeHealthFood', id)
  },
  purgeTrashedHealthFoods: async () => {
    await call('purgeTrashedHealthFoods')
  },
  healthMeals: () => call('healthMeals'),
  saveHealthMeal: async (meal) => {
    const next: HealthMeal = { ...meal, updatedAt: Date.now() }
    await call('saveHealthMeal', next)
    return next
  },
  removeHealthMeal: async (id) => {
    await call('removeHealthMeal', id)
  },
  removeHealthMeals: (ids) => call('removeHealthMeals', ids),
  trashedHealthMeals: () => call('trashedHealthMeals'),
  restoreHealthMeal: async (id) => {
    await call('restoreHealthMeal', id)
  },
  restoreHealthMeals: (ids) => call('restoreHealthMeals', ids),
  purgeHealthMeal: async (id) => {
    await call('purgeHealthMeal', id)
  },
  purgeTrashedHealthMeals: async () => {
    await call('purgeTrashedHealthMeals')
  },
  intakesOfDay: (dateKey) => call('intakesOfDay', dateKey),
  intakeDays: () => call('intakeDays'),
  addIntake: (intake) => call('insertIntake', intake),
  removeIntake: async (id) => {
    await call('removeIntake', id)
  },
  removeIntakes: (ids) => call('removeIntakes', ids),
  restoreIntake: async (id) => {
    await call('restoreIntake', id)
  },
  restoreIntakes: (ids) => call('restoreIntakes', ids),
  trashedIntakes: () => call('trashedIntakes'),
  purgeIntake: async (id) => {
    await call('purgeIntake', id)
  },
  purgeTrashedIntakes: async () => {
    await call('purgeTrashedIntakes')
  },
}
