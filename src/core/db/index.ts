/**
 * 存储实现的选择点。
 *
 * 页面和业务代码都不该 import 这个文件——它们统一走 `features/diary/diaryRepo.ts`。
 * 这里只回答一个问题：当前这个运行环境用哪份 `DiaryStore`。
 *
 * - 桌面程序（Electron 预加载注入了 `window.desktop.db`）：SQLite，数据落在 userData/starburst.db
 * - 浏览器 / 安卓壳：Dexie（IndexedDB）
 *
 * 选定之后统一套上 `withChangeBus`：写方法成功后广播一次变化，
 * 页面订阅（`core/db/live.ts`）据此重新查询——这样两种后端的行为一致，
 * 不会出现「换了 SQLite 之后页面不刷新」。
 */
import { desktopBridge } from '../desktop'
import { withChangeBus } from './changes'
import { dexieStore } from './dexieStore'
import { sqliteStore } from './sqliteStore'
import type { DiaryStore } from './store'

const impl: DiaryStore = desktopBridge()?.db ? sqliteStore : dexieStore

export const store: DiaryStore = withChangeBus(impl)

export type { DiaryStore, ImportStats } from './store'
