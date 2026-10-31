/**
 * 记录里内联的一张图片：dataURL 直接躺在记录里，跟着备份 / 导出一起走。
 *
 * 不另开图片表：图跟记录同生共死，软删除、回收站、跨设备导入都不用再对账。
 * 代价是记录会变大，所以插入时默认压缩，设置里可以改成存原图。
 */
export interface DiaryImage {
  /** 内部唯一 id（ULID），日记正文用 [[img:id]] 标记引用它 */
  id: string
  /** data:image/...;base64,... */
  dataUrl: string
  /** 存下来的像素尺寸，渲染时先按它占位，免得图加载完页面才跳一下 */
  width: number
  height: number
}

/** 一条日记 */
export interface DiaryEntry {
  /** 内部唯一 id（ULID，天然按时间有序） */
  id: string
  /** 7 位十六进制短编号，用于展示与区分，如 a3f9c21 */
  code: string
  /** 归属日期，'YYYY-MM-DD'（按设备本地时区派生） */
  dateKey: string
  createdAt: number
  updatedAt: number
  /** 纯文本正文；图片用 [[img:id]] 占位，渲染时换成真图 */
  content: string
  /** 正文里插的图片；没有就是空数组 */
  images: DiaryImage[]
  /** 软删除标记 */
  deletedAt: number | null
}

/** 某一天的信息（与条数无关，同一天的多条日记共享） */
export interface DiaryDay {
  dateKey: string
  /** 天气描述，手填或以后由天气接口写入 */
  weather: string | null
  updatedAt: number
}

/** 性别：只影响 BMR 公式里的常数项，不做别的用途 */
export type HealthSex = 'male' | 'female'

/** 日常活动量：Mifflin-St Jeor 的活动系数，档位少一点更好选 */
export type HealthActivity = 'sedentary' | 'light' | 'moderate' | 'high'

/** 一次空腹称重：dateKey 是称重那天，'YYYY-MM-DD' */
export interface WeighIn {
  dateKey: string
  weightKg: number
  createdAt: number
}

/** 身体档案：整个应用只有一行，id 固定为 'me' */
export interface HealthProfile {
  id: 'me'
  sex: HealthSex | null
  age: number | null
  heightCm: number | null
  /** 最新一次体重；空腹称重的历史序列在 weighIns */
  weightKg: number | null
  /** 上面那个体重是什么时候称的 */
  weightAt: number | null
  activity: HealthActivity | null
  /** 维持体重的热量，靠公式估算或手填，可随时改 */
  tdee: number | null
  /** 减脂/增肌的目标线，必须自己定 */
  targetKcal: number | null
  proteinTarget: number | null
  /** 计划预设的键；空串表示没选。预设只改目标和一段话，不动 TDEE */
  plan: string
  /** 一段自我评价 / 计划说明 */
  note: string
  /** 每周空腹称重日：1=周一 … 7=周日；null 表示没设 */
  weighDay: number | null
  /** 称重提醒时刻，'HH:MM' */
  weighTime: string
  /** 理想的入睡时刻，'HH:MM'；睡眠条上画成一条「理想窗口」 */
  idealBedtime: string
  /** 理想的起床时刻，'HH:MM' */
  idealWakeTime: string
  /** 空腹称重历史，新的在前，只留最近 120 条 */
  weighIns: WeighIn[]
  updatedAt: number
}

/**
 * 食物库的一条。营养按每 100g 存，另外记一个常用份量，
 * 这样「一拳米饭」和「150g 米饭」都能记，不用为每种吃法建一条。
 */
export interface HealthFood {
  id: string
  /** 7 位十六进制短编号，列表里用来区分同名食物 */
  code: string
  name: string
  /** 每 100g 的热量与三大营养素 */
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** 常用份量的叫法，例如「1 个鸡腿」；可以为空 */
  servingName: string | null
  servingGrams: number | null
  /** 食物照片，压缩后的 data URL（1:1、长边 ≤512、约 30–50KB）；没有就 null */
  photo: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** 套餐里的一项：引用食物库的一条，加这份吃多少克 */
export interface HealthMealItem {
  foodId: string
  grams: number
}

/**
 * 整体食物（套餐），比如「沙县鸡腿饭」= 卤鸡腿 + 卤蛋 + 米饭。
 * 只存组合，不存营养值：营养每次按食物库实时算，改名、改营养都跟着走。
 */
export interface HealthMeal {
  id: string
  name: string
  items: HealthMealItem[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** 一笔套餐摄入的成分快照：当时每项食物叫什么、吃了多少、有多少营养 */
export interface IntakeComponent {
  /** 对应的食物库条目；引用已经被彻底删掉时为空 */
  foodId: string | null
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** 记下的一笔摄入：存当时的快照，以后改食物库不会改历史 */
export interface HealthIntake {
  id: string
  /** 7 位十六进制短编号，跟日记一样用来指代某一笔 */
  code: string
  dateKey: string
  time: string
  /** 来自食物库时记下 id，便于统计最爱吃的东西；手动新增时为空 */
  foodId: string | null
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** 从哪儿来的：食物库 / 手动新增（AI 识别和助手对话以后再接） */
  source: 'library' | 'manual'
  /** 来自套餐时记下套餐 id，普通食物为空 */
  mealId?: string | null
  /** 套餐这一行的成分快照；普通食物没有 */
  components?: IntakeComponent[] | null
  /** 记这一笔时的目标口径：当天第一笔定下来，之后补记沿用，旧记录可能没有 */
  tdeeSnapshot?: number | null
  targetKcalSnapshot?: number | null
  proteinTargetSnapshot?: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** 一次夜醒：几点醒的、这次醒了多久 */
export interface SleepWakeEvent {
  /** 醒来时刻，'HH:MM' */
  time: string
  /** 这次醒了几分钟；0 表示只是短暂醒来 */
  minutes: number
}

/**
 * 一夜睡眠：一行一夜，dateKey = 起床那天（周五晚睡周六起 → 记周六）。
 * 时长是派生值不存（跨零点自动 +24h）。夜醒按事件逐条记，次数与累计分钟由事件汇总。
 */
export interface HealthSleep {
  id: string
  /** 7 位十六进制短编号，跟日记一样用来指代某一夜 */
  code: string
  /** 起床那天，'YYYY-MM-DD' */
  dateKey: string
  /** 就寝时刻，'HH:MM' */
  bedtime: string
  /** 起床时刻，'HH:MM' */
  wakeTime: string
  /** 睡得怎么样，1–5；没评就是 null */
  quality: number | null
  /** 逐条夜醒记录；空数组表示没醒过，或者旧记录没补具体时间 */
  wakeEvents: SleepWakeEvent[]
  /** 旧口径：夜醒次数，仍保留用于读取旧备份；新记录保存时由 wakeEvents 汇总 */
  wakeCount: number | null
  /** 旧口径：累计醒来分钟，仍保留用于读取旧备份；新记录保存时由 wakeEvents 汇总 */
  wakeMinutes: number | null
  note: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** 一笔收支的方向：钱进来还是出去 */
export type FinanceKind = 'expense' | 'income'

/**
 * 经济模块：一行一笔收支。
 *
 * 金额统一存正数，方向由 `kind` 决定；分类先存一个可扩展的字符串 id，
 * 内置分类和以后的自定义分类共用这个字段。
 */
export interface FinanceEntry {
  id: string
  /** 7 位十六进制短编号，跟日记、食物一样用来指代某一笔 */
  code: string
  dateKey: string
  /** 支出还是收入 */
  kind: FinanceKind
  /** 分类 id；空串表示还没选分类 */
  category: string
  /** 项目名，例如「午饭」 */
  name: string
  /** 金额，正数；方向看 kind */
  amount: number
  note: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** 随记的一笔：某天某个时刻发生的一件小事，一天可以有很多笔 */
export interface DiaryStamp {
  /** 内部唯一 id（ULID） */
  id: string
  /** 7 位十六进制短编号，和日记一样用来指代某一笔 */
  code: string
  /** 归属日期，'YYYY-MM-DD' */
  dateKey: string
  /** 时刻标记，'HH:MM' */
  time: string
  /** 这一笔的内容；可以是空串——只拍一张图也是一条随记 */
  content: string
  /** 随记带的图片，可以多张；没有就是空数组 */
  images: DiaryImage[]
  createdAt: number
  updatedAt: number
  /** 软删除标记 */
  deletedAt: number | null
}

/** 预设库的分类：常用人物 / 常用地名 */
export type PresetKind = 'person' | 'place'

/**
 * 日记预设库的一条：编辑日记时可一键插入的名字。
 * 和食物库一样带 hex 短编号，备份、查重时能指代具体哪一条。
 */
export interface DiaryPreset {
  id: string
  /** 7 位十六进制短编号 */
  code: string
  kind: PresetKind
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}
