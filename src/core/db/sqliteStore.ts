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
import { cleanTags } from './normalize'
import type {
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
  HealthSleep,
  HealthTraining,
  ScheduleItem,
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
  briefEntriesOfDay: (dateKey) => call('briefEntriesOfDay', dateKey),
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
      images: [],
      tags: [],
      deletedAt: null,
    }
    await call('insertEntry', entry)
    return entry
  },

  updateContent: async (id, content, images) => {
    await call('updateContent', id, content, images)
  },
  setEntryTags: async (id, tags) => {
    await call('setEntryTags', id, tags)
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
  briefStampsOfDay: (dateKey) => call('briefStampsOfDay', dateKey),
  stampById: (id) => call('stampById', id),

  async addStamp(dateKey) {
    const now = Date.now()
    const stamp: DiaryStamp = {
      id: newId(),
      code: newCode(),
      dateKey,
      time: formatClock(now),
      content: '',
      images: [],
      tags: [],
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
  setStampTags: async (id, tags) => {
    await call('setStampTags', id, tags)
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
  briefEntries: () => call('briefEntries'),
  briefStamps: () => call('briefStamps'),
  diaryComposeData: () => call('diaryComposeData'),
  assistantData: () => call('assistantData'),
  everyDay: () => call('everyDay'),
  totals: () => call('totals'),
  exportAllData: () => call('exportAllData'),
  searchRecords: (keyword, categoryIds) => call('searchRecords', keyword, categoryIds ?? []),
  activityBetween: (from, to) => call('activityBetween', from, to),
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
  deleteHealthProfile: () => call('deleteHealthProfile'),
  healthFoods: () => call('healthFoods'),
  healthFoodBriefs: () => call('healthFoodBriefs'),
  healthFoodById: (id) => call('healthFoodById', id),
  healthFoodPhoto: (id) => call('healthFoodPhoto', id),
  saveHealthFood: async (food) => {
    const next: HealthFood = { ...food, tags: cleanTags(food.tags), updatedAt: Date.now() }
    await call('saveHealthFood', next)
    return next
  },
  saveHealthFoodAndSyncIntakes: async (food) => {
    const next: HealthFood = { ...food, tags: cleanTags(food.tags), updatedAt: Date.now() }
    return call('saveHealthFoodAndSyncIntakes', next)
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
  healthMealBriefs: () => call('healthMealBriefs'),
  healthMealById: (id) => call('healthMealById', id),
  healthMealPhoto: (id) => call('healthMealPhoto', id),
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
  intakesBetween: (from, to) => call('intakesBetween', from, to),
  financeOfMonth: (monthKey) => call('financeOfMonth', monthKey),
  financeBriefsOfMonth: (monthKey) => call('financeBriefsOfMonth', monthKey),
  financeById: (id) => call('financeById', id),
  financePhoto: (id) => call('financePhoto', id),
  addFinance: (entry) => call('addFinance', entry),
  saveFinance: async (entry) => {
    const next: FinanceEntry = { ...entry, updatedAt: Date.now() }
    await call('saveFinance', next)
    return next
  },
  removeFinance: async (id) => {
    await call('removeFinance', id)
  },
  removeFinances: (ids) => call('removeFinances', ids),
  restoreFinance: async (id) => {
    await call('restoreFinance', id)
  },
  restoreFinances: (ids) => call('restoreFinances', ids),
  financeDays: () => call('financeDays'),
  trashedFinance: () => call('trashedFinance'),
  purgeFinance: (id) => call('purgeFinance', id),
  purgeTrashedFinance: () => call('purgeTrashedFinance'),
  intakeDays: () => call('intakeDays'),
  addIntake: (intake) => call('insertIntake', intake),
  saveIntake: async (intake) => {
    const next: HealthIntake = { ...intake, updatedAt: Date.now() }
    await call('insertIntake', next)
    return next
  },
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
  sleepOfDay: (dateKey) => call('sleepOfDay', dateKey),
  sleepsBetween: (from, to) => call('sleepsBetween', from, to),
  sleepDays: () => call('sleepDays'),
  saveHealthSleep: async (sleep) => {
    const next: HealthSleep = { ...sleep, updatedAt: Date.now() }
    await call('saveHealthSleep', next)
    return next
  },
  removeHealthSleep: async (id) => {
    await call('removeHealthSleep', id)
  },
  restoreHealthSleep: async (id) => {
    await call('restoreHealthSleep', id)
  },
  trashedHealthSleeps: () => call('trashedHealthSleeps'),
  purgeHealthSleep: async (id) => {
    await call('purgeHealthSleep', id)
  },
  purgeTrashedHealthSleeps: async () => {
    await call('purgeTrashedHealthSleeps')
  },

  // ─────────── 训练 ───────────
  trainingOfDay: (dateKey) => call('trainingOfDay', dateKey),
  trainingsBetween: (from, to) => call('trainingsBetween', from, to),
  trainingDays: () => call('trainingDays'),
  latestTraining: () => call('latestTraining'),
  saveHealthTraining: async (training) => {
    const next: HealthTraining = { ...training, updatedAt: Date.now() }
    await call('saveHealthTraining', next)
    return next
  },
  removeHealthTraining: async (id) => {
    await call('removeHealthTraining', id)
  },
  restoreHealthTraining: async (id) => {
    await call('restoreHealthTraining', id)
  },
  trashedHealthTrainings: () => call('trashedHealthTrainings'),
  purgeHealthTraining: async (id) => {
    await call('purgeHealthTraining', id)
  },
  purgeTrashedHealthTrainings: async () => {
    await call('purgeTrashedHealthTrainings')
  },

  // ─────────── 日程 / 定期任务 ───────────
  schedules: () => call('schedules'),
  trashedSchedules: () => call('trashedSchedules'),
  saveSchedule: async (item) => {
    const next: ScheduleItem = { ...item, updatedAt: Date.now() }
    await call('saveSchedule', next)
    return next
  },
  removeSchedule: async (id) => {
    await call('removeSchedule', id)
  },
  restoreSchedule: async (id) => {
    await call('restoreSchedule', id)
  },
  purgeSchedule: async (id) => {
    await call('purgeSchedule', id)
  },
  purgeTrashedSchedules: async () => {
    await call('purgeTrashedSchedules')
  },
}
