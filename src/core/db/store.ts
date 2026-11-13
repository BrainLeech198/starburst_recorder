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
  HealthMeasurement,
  HealthProfile,
  HealthSleep,
  HealthTraining,
  ScheduleItem,
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
  measurements: SectionCount
  trainings: SectionCount
  finance: SectionCount
  schedules: SectionCount
}

/**
 * 库里在用的各类记录数量，一张表一项；回收站里的不算。
 * 数据页的「数据概览」和备份的勾选说明都读这份，加新表时记得一起补。
 */
export interface TableTotals {
  entries: number
  stamps: number
  /** 记了天气的天数 */
  days: number
  presets: number
  schedules: number
  foods: number
  meals: number
  intakes: number
  sleeps: number
  measurements: number
  trainings: number
  /** 身体档案里的称重历史条数 */
  weights: number
  finance: number
}

/**
 * 在用的记录一共多少条（设置页徽章用）。
 * 天气是按天存的状态，不是一条记录，所以只有它不计入；新表加进 `TableTotals` 会自动算进来。
 */
export function countRecords(totals: TableTotals): number {
  return Object.entries(totals)
    .filter(([key]) => key !== 'days')
    .reduce((sum, [, count]) => sum + count, 0)
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
  measurements?: HealthMeasurement[]
  trainings: HealthTraining[]
  finance: FinanceEntry[]
  /** 日程 / 定期任务；旧备份曾放在日记块里 */
  schedules: ScheduleItem[]
}

/** 收支列表与搜索摘要：票据照片延迟按 id 读取。 */
export type FinanceEntryBrief = Omit<FinanceEntry, 'photo'> & { hasPhoto: boolean }

/** AI 写日记只用到的上下文；不包含图库或票据照片。 */
export interface DiaryComposeData {
  entries: DiaryEntryBrief[]
  stamps: DiaryStampBrief[]
  days: DiaryDay[]
  intakes: HealthIntake[]
  sleeps: HealthSleep[]
  finance: FinanceEntryBrief[]
}

/** 助手 / 回顾 / 引用读取的全库摘要；仅图片字段被替换为张数或布尔值。 */
export type AssistantData = Omit<
  BackupData,
  'entries' | 'stamps' | 'foods' | 'meals' | 'finance'
> & {
  entries: DiaryEntryBrief[]
  stamps: DiaryStampBrief[]
  foods: HealthFoodBrief[]
  meals: HealthMealBrief[]
  finance: FinanceEntryBrief[]
}

/** 只读助手可以接收摘要，也允许纯逻辑调用方传入完整备份行。 */
export type AssistantDataSource = Omit<AssistantData, 'entries' | 'stamps' | 'foods' | 'meals' | 'finance'> & {
  entries: Array<DiaryEntry | DiaryEntryBrief>
  stamps: Array<DiaryStamp | DiaryStampBrief>
  foods: Array<HealthFood | HealthFoodBrief>
  meals: Array<HealthMeal | HealthMealBrief>
  finance: Array<FinanceEntry | FinanceEntryBrief>
}

/** 日记列表的轻量行：正文与元数据保留，图片只报告张数。 */
export type DiaryEntryBrief = Omit<DiaryEntry, 'images'> & { imageCount: number }
/** 随记列表的轻量行：正文与元数据保留，图片只报告张数。 */
export type DiaryStampBrief = Omit<DiaryStamp, 'images'> & { imageCount: number }
/** 食物列表行：照片只报告是否存在，营养和筛选字段保留。 */
export type HealthFoodBrief = Omit<HealthFood, 'photo'> & { hasPhoto: boolean }
/** 套餐列表行：照片只报告是否存在，成分和筛选字段保留。 */
export type HealthMealBrief = Omit<HealthMeal, 'photo'> & { hasPhoto: boolean }

/**
 * 全局搜索的结果：十类记录，按日期倒序；没有日期的库表（食物 / 套餐 / 预设）按名称排。
 * `tags` 是库里在用的全部标签（回收站里的不算），给筛选条用。
 */
export interface SearchResults {
  entries: DiaryEntryBrief[]
  stamps: DiaryStampBrief[]
  finance: FinanceEntryBrief[]
  sleeps: HealthSleep[]
  intakes: HealthIntake[]
  trainings: HealthTraining[]
  schedules: ScheduleItem[]
  foods: HealthFoodBrief[]
  meals: HealthMealBrief[]
  presets: DiaryPreset[]
  tags: string[]
}

/**
 * 某一天记了多少条，日历混色用。
 *
 * 只回数字、不带正文和图片：一个月 40 格要查 6 张表，
 * 把记录整行搬出来会连着内联图片一起读。
 */
export interface DayActivity {
  dateKey: string
  entries: number
  stamps: number
  intakes: number
  sleeps: number
  trainings: number
  finance: number
  weighIns: number
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
    /** 兼容旧调用：新备份使用独立的 schedule 块 */
    schedules?: ScheduleItem[]
  }
  health?: {
    /** null 表示这一块不带身体档案 */
    profile: HealthProfile | null
    foods: HealthFood[]
    meals: HealthMeal[]
    intakes: HealthIntake[]
    /** 旧备份没有这个字段 */
    sleeps: HealthSleep[]
    /** 旧备份没有这个字段 */
    measurements?: HealthMeasurement[]
    /** 旧备份没有这个字段 */
    /** 兼容旧调用：新备份使用独立的 training 块 */
    trainings?: HealthTraining[]
  }
  schedule?: { items: ScheduleItem[] }
  training?: { entries: HealthTraining[] }
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
    measurements: zero(),
    trainings: zero(),
    finance: zero(),
    schedules: zero(),
  }
}

export interface DiaryStore {
  // ─────────── 日记 ───────────

  /** 某一天的全部日记，按创建时间升序，已软删除的不算 */
  entriesOfDay(dateKey: string): Promise<DiaryEntry[]>
  /** 某一天的日记摘要，不读取图片数据 */
  briefEntriesOfDay(dateKey: string): Promise<DiaryEntryBrief[]>
  /** 按短编号找一篇（URL 里用的就是它） */
  entryByCode(code: string): Promise<DiaryEntry | undefined>
  createEntry(dateKey: string): Promise<DiaryEntry>
  updateContent(id: string, content: string, images: DiaryImage[]): Promise<void>
  /** 整组替换标签：编辑页保存时一并写入 */
  setEntryTags(id: string, tags: string[]): Promise<void>
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
  /** 某一天的随记摘要，不读取图片数据 */
  briefStampsOfDay(dateKey: string): Promise<DiaryStampBrief[]>
  /** 按 id 读取一笔随记（含图片），仅在图片进入视口或用户操作时调用 */
  stampById(id: string): Promise<DiaryStamp | undefined>
  addStamp(dateKey: string): Promise<DiaryStamp>
  updateStamp(
    id: string,
    patch: { time?: string; content?: string; images?: DiaryImage[] },
  ): Promise<void>
  /** 整组替换标签 */
  setStampTags(id: string, tags: string[]): Promise<void>
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
  /** 全部日记摘要，不读取图片数据 */
  briefEntries(): Promise<DiaryEntryBrief[]>
  /** 全部随记摘要，不读取图片数据 */
  briefStamps(): Promise<DiaryStampBrief[]>
  /** AI 日记上下文所需记录，不读取图片数据 */
  diaryComposeData(): Promise<DiaryComposeData>
  /** 助手等只读场景所需的全库摘要，不读取图片数据 */
  assistantData(): Promise<AssistantData>
  everyDay(): Promise<DiaryDay[]>
  /** 库里在用的东西各有多少，给数据页的概览用（回收站里的不算） */
  totals(): Promise<TableTotals>
  /** 整库导出：全部数据，连回收站里的都在内 */
  exportAllData(): Promise<BackupData>
  /**
   * 全局搜索：日记、随记、收支、睡眠、摄入、训练、日程、食物库、套餐、预设，
   * 回收站里的不算。匹配规则见 `core/search/match.ts`。
   *
   * 关键词为空时只回标签列表；以 `#` 开头的关键词只按标签精确匹配。
   * `categoryIds` 是调用方把关键词对到收支分类的结果——库里只存分类 id，
   * 翻译属于界面层的事，存储层不认文案，只按 id 精确比对。
   */
  searchRecords(keyword: string, categoryIds?: string[]): Promise<SearchResults>
  /**
   * 日期区间（含首尾）内每天记了多少条；只回有记录的日子，按日期升序。
   * 日历的月格子按这个结果混色，不读正文与图片。
   */
  activityBetween(from: string, to: string): Promise<DayActivity[]>
  /** 一键清空日记、健康、经济数据，清完不可恢复 */
  clearDiaryData(): Promise<void>
  clearHealthData(): Promise<void>
  clearFinanceData(): Promise<void>
  /** 安全清空：整块软删除进回收站，之后还能逐条恢复 */
  trashDiaryData(): Promise<void>
  trashHealthData(): Promise<void>
  trashFinanceData(): Promise<void>
  /**
   * 分块导入：只写传进来的块，所有块在同一个事务里。
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
  /** 只删除固定 id='me' 的档案；调用方负责确认与撤销快照。 */
  deleteHealthProfile(): Promise<void>
  /** 食物库，按名称排序，已软删除的不算 */
  healthFoods(): Promise<HealthFood[]>
  healthFoodBriefs(): Promise<HealthFoodBrief[]>
  healthFoodById(id: string): Promise<HealthFood | undefined>
  healthFoodPhoto(id: string): Promise<string | null>
  /** 回收站里的食物，按删除时间倒序 */
  trashedHealthFoods(): Promise<HealthFood[]>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveHealthFood(food: HealthFood): Promise<HealthFood>
  /** 原子保存食物并同步更新所有引用它的历史摄入快照；返回受影响的摄入笔数。 */
  saveHealthFoodAndSyncIntakes(food: HealthFood): Promise<{ intakes: number }>
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
  healthMealBriefs(): Promise<HealthMealBrief[]>
  healthMealById(id: string): Promise<HealthMeal | undefined>
  healthMealPhoto(id: string): Promise<string | null>
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
  /** 日期区间（含首尾）内的摄入，按日期、时间正序；趋势页做区间统计用 */
  intakesBetween(from: string, to: string): Promise<HealthIntake[]>
  /** 有摄入记录的所有日期，日历上用来标「这天记过」 */
  intakeDays(): Promise<string[]>
  addIntake(intake: HealthIntake): Promise<HealthIntake>
  /** 整行更新已有摄入；找不到 id 时按新增处理 */
  saveIntake(intake: HealthIntake): Promise<HealthIntake>
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
  /** 日期区间（含首尾）内的睡眠，按日期正序；趋势页做区间统计用 */
  sleepsBetween(from: string, to: string): Promise<HealthSleep[]>
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

  /** 日期区间内的身体测量，按日期正序；默认只返回未删除记录。 */
  measurementsBetween(from: string, to: string): Promise<HealthMeasurement[]>
  /** 某日的身体测量；未记录或已删除时返回 undefined。 */
  measurementOfDay(dateKey: string): Promise<HealthMeasurement | undefined>
  /** 按日期新增或覆盖腰围测量。 */
  saveHealthMeasurement(measurement: HealthMeasurement): Promise<HealthMeasurement>

  // ─────────── 训练 ───────────

  /** 某一天的全部训练，按开始时刻升序，已软删除的不算 */
  trainingOfDay(dateKey: string): Promise<HealthTraining[]>
  /** 日期区间（含首尾）内的训练，按日期、时刻升序 */
  trainingsBetween(from: string, to: string): Promise<HealthTraining[]>
  /** 有训练记录的所有日期 */
  trainingDays(): Promise<string[]>
  /** 最近一次训练（不含回收站），用来算断档天数与「复制上次」 */
  latestTraining(): Promise<HealthTraining | undefined>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveHealthTraining(training: HealthTraining): Promise<HealthTraining>
  /** 软删除：只打标记，可撤销 */
  removeHealthTraining(id: string): Promise<void>
  restoreHealthTraining(id: string): Promise<void>
  /** 回收站里的训练记录，按删除时间倒序 */
  trashedHealthTrainings(): Promise<HealthTraining[]>
  purgeHealthTraining(id: string): Promise<void>
  purgeTrashedHealthTrainings(): Promise<void>

  /** 某个月的收支（按 dateKey 前 7 位），日期倒序、同一天按创建时间倒序 */
  financeOfMonth(monthKey: string): Promise<FinanceEntry[]>
  /** 某个月的收支摘要，不读取票据图片 */
  financeBriefsOfMonth(monthKey: string): Promise<FinanceEntryBrief[]>
  /** 按 id 读取单条完整收支记录 */
  financeById(id: string): Promise<FinanceEntry | undefined>
  /** 按 id 读取单张票据图片 */
  financePhoto(id: string): Promise<string | null>
  /** 有收支记录的所有日期，日历上用来标「这天记过」 */
  financeDays(): Promise<string[]>
  addFinance(entry: FinanceEntry): Promise<FinanceEntry>
  /** 整行更新已有收支；找不到 id 时按新增处理 */
  saveFinance(entry: FinanceEntry): Promise<FinanceEntry>
  /** 软删除：只打标记，可撤销 */
  removeFinance(id: string): Promise<void>
  /** 批量软删除，返回实际改到的行数 */
  removeFinances(ids: string[]): Promise<number>
  restoreFinance(id: string): Promise<void>
  restoreFinances(ids: string[]): Promise<number>
  /** 回收站里的收支，按删除时间倒序 */
  trashedFinance(): Promise<FinanceEntry[]>
  /** 从回收站彻底删掉一条，不可恢复 */
  purgeFinance(id: string): Promise<void>
  purgeTrashedFinance(): Promise<void>

  // ─────────── 日程 / 定期任务 ───────────

  /**
   * 全部在用的日程与定期任务，按起始日期、时刻升序。
   * 定期任务只有一行，展开成某一天由页面用 `scheduleMath` 算。
   */
  schedules(): Promise<ScheduleItem[]>
  /** 回收站里的日程，最近删的排前面 */
  trashedSchedules(): Promise<ScheduleItem[]>
  /** 新增或整行覆盖；返回存进去的那一条 */
  saveSchedule(item: ScheduleItem): Promise<ScheduleItem>
  /** 软删除：只打标记，可撤销 */
  removeSchedule(id: string): Promise<void>
  restoreSchedule(id: string): Promise<void>
  /** 从回收站彻底删掉一条，不可恢复 */
  purgeSchedule(id: string): Promise<void>
  purgeTrashedSchedules(): Promise<void>
}
