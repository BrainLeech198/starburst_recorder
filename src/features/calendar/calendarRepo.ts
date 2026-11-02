/** 日历模块的数据入口：页面只认这里，底下是 Dexie 还是 SQLite 由 `core/db` 决定。 */
import { store } from '@/core/db'

export const { activityBetween } = store

export type { DayActivity } from '@/core/db/store'
