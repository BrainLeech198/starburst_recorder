/**
 * 写操作的通知总线。
 *
 * 换掉 Dexie 之后，`dexie-react-hooks` 的自动 live query 只能看到 Dexie 自己的写入，
 * 看不到 SQLite 主进程那边发生的变化。所以统一在这里发通知：
 * 任何写方法成功后，让所有正在看的页面重新执行一次查询。
 *
 * 通知由 `withChangeBus` 包在存储实现外面统一触发，实现本身不用记得调。
 */
import type { DiaryStore } from './store'

type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeChanges(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyChange() {
  // 复制一份再遍历：订阅回调里可能会退订
  for (const listener of [...listeners]) listener()
}

/** 会改数据的 DiaryStore 方法；读方法不触发通知 */
const WRITE_METHODS = new Set([
  'createEntry',
  'updateContent',
  'removeEntry',
  'removeEntries',
  'restoreEntry',
  'restoreEntries',
  'moveEntries',
  'setWeather',
  'addStamp',
  'updateStamp',
  'removeStamp',
  'restoreStamp',
  'removeStamps',
  'restoreStamps',
  'moveStamps',
  'saveDiaryPreset',
  'removeDiaryPreset',
  'removeDiaryPresets',
  'restoreDiaryPreset',
  'restoreDiaryPresets',
  'purgeDiaryPreset',
  'purgeTrashedDiaryPresets',
  'purgeEntry',
  'purgeStamp',
  'purgeEntries',
  'purgeStamps',
  'purgeTrashedEntries',
  'purgeTrashedStamps',
  'importBackup',
  'importSections',
  'replaceSections',
  'clearDiaryData',
  'clearHealthData',
  'clearFinanceData',
  'trashDiaryData',
  'trashHealthData',
  'trashFinanceData',
  // 健康
  'saveHealthProfile',
  'saveHealthFood',
  'mergeHealthFoods',
  'removeHealthFood',
  'removeHealthFoods',
  'restoreHealthFood',
  'restoreHealthFoods',
  'purgeHealthFood',
  'purgeTrashedHealthFoods',
  'saveHealthMeal',
  'removeHealthMeal',
  'removeHealthMeals',
  'restoreHealthMeal',
  'restoreHealthMeals',
  'purgeHealthMeal',
  'purgeTrashedHealthMeals',
  'addIntake',
  'removeIntake',
  'removeIntakes',
  'restoreIntake',
  'restoreIntakes',
])

/** 给存储实现套一层：写成功后自动广播变化，读操作原样透传 */
export function withChangeBus(impl: DiaryStore): DiaryStore {
  return new Proxy(impl, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || typeof value !== 'function' || !WRITE_METHODS.has(property)) {
        return value
      }
      return async (...args: unknown[]) => {
        const result = await (value as (...input: unknown[]) => unknown).apply(target, args)
        notifyChange()
        return result
      }
    },
  }) as DiaryStore
}
