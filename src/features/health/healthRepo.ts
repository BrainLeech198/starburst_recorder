/**
 * 健康模块的数据入口，和 `diary/diaryRepo.ts` 同一个套路：
 * 页面只认这里，底下是 Dexie 还是 SQLite 由 `core/db/index.ts` 决定。
 */
import { store } from '@/core/db'

export const {
  healthProfile,
  saveHealthProfile,
  healthFoods,
  trashedHealthFoods,
  saveHealthFood,
  mergeHealthFoods,
  removeHealthFood,
  removeHealthFoods,
  restoreHealthFood,
  restoreHealthFoods,
  purgeHealthFood,
  purgeTrashedHealthFoods,
  healthMeals,
  trashedHealthMeals,
  saveHealthMeal,
  removeHealthMeal,
  removeHealthMeals,
  restoreHealthMeal,
  restoreHealthMeals,
  purgeHealthMeal,
  purgeTrashedHealthMeals,
  intakesOfDay,
  intakeDays,
  addIntake,
  saveIntake,
  removeIntake,
  removeIntakes,
  restoreIntake,
  restoreIntakes,
  trashedIntakes,
  purgeIntake,
  purgeTrashedIntakes,
  sleepOfDay,
  sleepDays,
  saveHealthSleep,
  removeHealthSleep,
  restoreHealthSleep,
  trashedHealthSleeps,
  purgeHealthSleep,
  purgeTrashedHealthSleeps,
  // 整库取数：健康页的「导出」要把所选摄入放进四类记录里一起挑
  exportAllData,
} = store

export type { BackupData } from '@/core/db/store'
