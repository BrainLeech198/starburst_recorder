/**
 * 存储实现的选择点。
 *
 * 页面和业务代码都不该 import 这个文件——它们统一走 `features/diary/diaryRepo.ts`。
 * 以后接 SQLite / 同步层，只在这里换成另一份 `DiaryStore` 实现；
 * 页面、备份、AI 整理都不需要知道底下是什么。
 */
import { dexieStore } from './dexieStore'
import type { DiaryStore } from './store'

export const store: DiaryStore = dexieStore

export type { DiaryStore, ImportStats } from './store'
