/**
 * 训练模块的数据入口，和 `healthRepo` 同一套路：
 * 页面只认这里，底下是 Dexie 还是 SQLite 由 `core/db/index.ts` 决定。
 */
import { store } from '@/core/db'

export const {
  trainingOfDay,
  trainingsBetween,
  trainingDays,
  latestTraining,
  saveHealthTraining,
  removeHealthTraining,
  restoreHealthTraining,
  trashedHealthTrainings,
  purgeHealthTraining,
  purgeTrashedHealthTrainings,
  exportAllData,
} = store
