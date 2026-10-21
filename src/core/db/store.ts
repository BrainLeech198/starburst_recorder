/**
 * 存储层的契约。
 *
 * 页面不直接碰数据库，只认 `features/diary/diaryRepo.ts` 里这组同名函数；
 * 这些函数由哪个实现提供，由 `core/db/index.ts` 决定。现在是 Dexie，
 * 以后换 SQLite 只需要再写一份 `DiaryStore`，页面不用动。
 *
 * 约束：所有方法都是纯异步、不依赖调用方持有的连接或事务对象；
 * 批量操作返回受影响的行数，方便调用方判断「有没有真的改到」。
 */
import type { DiaryDay, DiaryEntry, DiaryStamp } from './schema'

export interface ImportStats {
  entries: { total: number; overwritten: number }
  stamps: { total: number; overwritten: number }
  days: { total: number; overwritten: number }
}

export interface DiaryStore {
  // ─────────── 日记 ───────────

  /** 某一天的全部日记，按创建时间升序，已软删除的不算 */
  entriesOfDay(dateKey: string): Promise<DiaryEntry[]>
  /** 按短编号找一篇（URL 里用的就是它） */
  entryByCode(code: string): Promise<DiaryEntry | undefined>
  createEntry(dateKey: string): Promise<DiaryEntry>
  updateContent(id: string, content: string): Promise<void>
  /** 软删除：只打标记，可撤销 */
  removeEntry(id: string): Promise<void>
  removeEntries(ids: string[]): Promise<number>
  restoreEntry(id: string): Promise<void>
  restoreEntries(ids: string[]): Promise<number>
  /** 批量换到另一天：记错日期时用 */
  moveEntries(ids: string[], dateKey: string): Promise<number>

  // ─────────── 某天的信息（天气） ───────────

  dayInfo(dateKey: string): Promise<DiaryDay | undefined>
  setWeather(dateKey: string, weather: string): Promise<void>

  // ─────────── 随记 ───────────

  /** 某一天的全部随记，按时间正序，已软删除的不算 */
  stampsOfDay(dateKey: string): Promise<DiaryStamp[]>
  addStamp(dateKey: string): Promise<DiaryStamp>
  updateStamp(id: string, patch: { time?: string; content?: string }): Promise<void>
  /** 软删除：只打标记，可撤销 */
  removeStamp(id: string): Promise<void>
  restoreStamp(id: string): Promise<void>
  removeStamps(ids: string[]): Promise<number>
  restoreStamps(ids: string[]): Promise<number>
  moveStamps(ids: string[], dateKey: string): Promise<number>

  // ─────────── 回收站 ───────────

  /** 回收站里的日记，最近删的排前面 */
  trashedEntries(): Promise<DiaryEntry[]>
  /** 回收站里的随记，最近删的排前面 */
  trashedStamps(): Promise<DiaryStamp[]>
  /** 彻底删除：连记录本身一起删掉，没有撤销 */
  purgeEntry(id: string): Promise<void>
  purgeStamp(id: string): Promise<void>
  purgeEntries(ids: string[]): Promise<number>
  purgeStamps(ids: string[]): Promise<number>
  /** 清空日记回收站，不动随记 */
  purgeTrashedEntries(): Promise<void>
  /** 清空随记回收站，不动日记 */
  purgeTrashedStamps(): Promise<void>

  // ─────────── 全量备份与恢复 ───────────

  /** 取全部，连回收站里的也一起取 */
  everyEntry(): Promise<DiaryEntry[]>
  everyStamp(): Promise<DiaryStamp[]>
  everyDay(): Promise<DiaryDay[]>
  /** 库里有几样东西（含回收站），给设置页的「当前值」用 */
  totals(): Promise<{ entries: number; stamps: number }>
  /**
   * 导入一份备份：同 id 以备份为准。
   * 实现必须保证三张表在同一个事务里，不能出现「日记进了一半」。
   */
  importBackup(data: {
    entries: DiaryEntry[]
    stamps: DiaryStamp[]
    days: DiaryDay[]
  }): Promise<ImportStats>
}
