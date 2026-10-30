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
import type {
  DiaryDay,
  DiaryEntry,
  DiaryImage,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
  HealthSleep,
} from './schema'

/** 一块数据的导入结果：一共多少条、其中多少条覆盖了库里已有的 */
export interface SectionCount {
  total: number
  overwritten: number
}

export interface ImportStats {
  entries: SectionCount
  stamps: SectionCount
  days: SectionCount
  presets: SectionCount
  profile: SectionCount
  foods: SectionCount
  meals: SectionCount
  intakes: SectionCount
  sleeps: SectionCount
  finance: SectionCount
}

/** 一份整库数据：连回收站里的都在内 */
export interface BackupData {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  days: DiaryDay[]
  presets: DiaryPreset[]
  profile: HealthProfile | null
  foods: HealthFood[]
  meals: HealthMeal[]
  intakes: HealthIntake[]
  sleeps: HealthSleep[]
  finance: FinanceEntry[]
}

/**
 * 分块导入：只写传进来的块，没传的块一个字都不动。
 * 实现必须把所有块放在同一个事务里，不能出现「日记进去了、健康写一半失败」。
 */
export interface BackupSections {
  diary?: {
    entries: DiaryEntry[]
    stamps: DiaryStamp[]
    days: DiaryDay[]
    /** 日记预设库跟着日记块走；旧备份没有这个字段 */
    presets: DiaryPreset[]
  }
  health?: {
    /** null 表示这一块不带身体档案 */
    profile: HealthProfile | null
    foods: HealthFood[]
    meals: HealthMeal[]
    intakes: HealthIntake[]
    /** 旧备份没有这个字段 */
    sleeps: HealthSleep[]
  }
  finance?: { entries: FinanceEntry[] }
}

/** 没导入的块也要给出零值，界面上就不用到处判空 */
export function zeroStats(): ImportStats {
  const zero = (): SectionCount => ({ total: 0, overwritten: 0 })
  return {
    entries: zero(),
    stamps: zero(),
    days: zero(),
    presets: zero(),
    profile: zero(),
    foods: zero(),
    meals: zero(),
    intakes: zero(),
    sleeps: zero(),
    finance: zero(),
  }
}

export interface DiaryStore {
  // ─────────── 日记 ───────────

  /** 某一天的全部日记，按创建时间升序，已软删除的不算 */
  entriesOfDay(dateKey: string): Promise<DiaryEntry[]>
  /** 按短编号找一篇（URL 里用的就是它） */
  entryByCode(code: string): Promise<DiaryEntry | undefined>
  createEntry(dateKey: string): Promise<DiaryEntry>
  updateContent(id: string, content: string, images: DiaryImage[]): Promise<void>
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
  updateStamp(
    id: string,
    patch: { time?: string; content?: string; images?: DiaryImage[] },
  ): Promise<void>
  /** 软删除：只打标记，可撤销 */
  removeStamp(id: string): Promise<void>
  restoreStamp(id: string): Promise<void>
  removeStamps(ids: string[]): Promise<number>
  restoreStamps(ids: string[]): Promise<number>
  moveStamps(ids: string[], dateKey: string): Promise<number>

  // ─────────── 预设库 ───────────

  /** 在用的预设，按分类再按名称排序 */
  diaryPresets(): Promise<DiaryPreset[]>
  trashedDiaryPresets(): Promise<DiaryPreset[]>
  saveDiaryPreset(preset: DiaryPreset): Promise<DiaryPreset>
  removeDiaryPreset(id: string): Promise<void>
  removeDiaryPresets(ids: string[]): Promise<number>
  restoreDiaryPreset(id: string): Promise<void>
  restoreDiaryPresets(ids: string[]): Promise<number>
  purgeDiaryPreset(id: string): Promise<void>
  purgeTrashedDiaryPresets(): Promise<void>

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
  /** 库里在用的东西各有多少，给设置页的「当前值」用（回收站里的不算） */
  totals(): Promise<{
    entries: number
    stamps: number
    foods: number
    meals: number
    intakes: number
  }>
  /** 整库导出：日记、健康、经济，连回收站里的都在内 */
  exportAllData(): Promise<BackupData>
  /** 一键清空三块数据，清完不可恢复 */
  clearDiaryData(): Promise<void>
  clearHealthData(): Promise<void>
  clearFinanceData(): Promise<void>
  /** 安全清空：整块软删除进回收站，之后还能逐条恢复 */
  trashDiaryData(): Promise<void>
  trashHealthData(): Promise<void>
  trashFinanceData(): Promise<void>
  /**
   * 分块导入：只写传进来的块，三块在同一个事务里。
   * 同 id 一律以传入的为准；「本地更新就不覆盖」这类判断在调用方做。
   */
  importSections(data: BackupSections): Promise<ImportStats>
  /**
   * 替换导入（快照恢复）：先清空本次涉及的块，再按备份完整写回。
   * 清空和写回必须在同一个事务里，避免中途失败留下半空的数据。
   */
  replaceSections(data: BackupSections): Promise<ImportStats>
  /**
   * 导入一份备份：同 id 以备份为准。
   * 实现必须保证三张表在同一个事务里，不能出现「日记进了一半」。
   */
  importBackup(data: {
    entries: DiaryEntry[]
    stamps: DiaryStamp[]
    days: DiaryDay[]
    presets: DiaryPreset[]
  }): Promise<ImportStats>

  // ─────────── 健康 ───────────

  /** 身体档案；还没填过就是 undefined，页面据此显示「先补全」 */
  healthProfile(): Promise<HealthProfile | undefined>
  /** 整行覆盖保存，不做字段级合并：页面拿到的就是完整一份 */
  saveHealthProfile(profile: HealthProfile): Promise<HealthProfile>
  /** 食物库，按名称排序，已软删除的不算 */
  healthFoods(): Promise<HealthFood[]>
  /** 回收站里的食物，按删除时间倒序 */
  trashedHealthFoods(): Promise<HealthFood[]>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveHealthFood(food: HealthFood): Promise<HealthFood>
  /**
   * 把 source 并进 target：历史摄入和套餐都改指 target，并按 target 当前营养重算。
   * source 进回收站。两份同时出现在同一笔 / 同一套餐里时保持两行，只换引用。
   */
  mergeHealthFoods(sourceId: string, targetId: string): Promise<{ intakes: number; meals: number }>
  removeHealthFood(id: string): Promise<void>
  /** 批量软删除，返回实际改到的行数 */
  removeHealthFoods(ids: string[]): Promise<number>
  restoreHealthFood(id: string): Promise<void>
  restoreHealthFoods(ids: string[]): Promise<number>
  /** 从回收站彻底删掉一条，不可恢复 */
  purgeHealthFood(id: string): Promise<void>
  purgeTrashedHealthFoods(): Promise<void>
  /** 套餐（整体食物），按名称排序，已软删除的不算 */
  healthMeals(): Promise<HealthMeal[]>
  /** 回收站里的套餐，按删除时间倒序 */
  trashedHealthMeals(): Promise<HealthMeal[]>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveHealthMeal(meal: HealthMeal): Promise<HealthMeal>
  removeHealthMeal(id: string): Promise<void>
  removeHealthMeals(ids: string[]): Promise<number>
  restoreHealthMeal(id: string): Promise<void>
  restoreHealthMeals(ids: string[]): Promise<number>
  purgeHealthMeal(id: string): Promise<void>
  purgeTrashedHealthMeals(): Promise<void>
  /** 某一天记下的摄入，按时间正序 */
  intakesOfDay(dateKey: string): Promise<HealthIntake[]>
  /** 有摄入记录的所有日期，日历上用来标「这天记过」 */
  intakeDays(): Promise<string[]>
  addIntake(intake: HealthIntake): Promise<HealthIntake>
  removeIntake(id: string): Promise<void>
  /** 批量软删除，返回实际改到的行数 */
  removeIntakes(ids: string[]): Promise<number>
  restoreIntake(id: string): Promise<void>
  restoreIntakes(ids: string[]): Promise<number>
  /** 回收站里的摄入，按删除时间倒序 */
  trashedIntakes(): Promise<HealthIntake[]>
  purgeIntake(id: string): Promise<void>
  purgeTrashedIntakes(): Promise<void>
  /** 某一天的一夜睡眠（dateKey = 起床那天）；没记就是 undefined */
  sleepOfDay(dateKey: string): Promise<HealthSleep | undefined>
  /** 有睡眠记录的所有日期，日历上用来标「这天记过」 */
  sleepDays(): Promise<string[]>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveHealthSleep(sleep: HealthSleep): Promise<HealthSleep>
  /** 软删除：只打标记，可撤销 */
  removeHealthSleep(id: string): Promise<void>
  restoreHealthSleep(id: string): Promise<void>
  /** 回收站里的睡眠记录，按删除时间倒序 */
  trashedHealthSleeps(): Promise<HealthSleep[]>
  purgeHealthSleep(id: string): Promise<void>
  purgeTrashedHealthSleeps(): Promise<void>
}
