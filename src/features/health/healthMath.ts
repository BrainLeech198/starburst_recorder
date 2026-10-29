/**
 * 健康模块里所有「算」的部分。刻意不碰 React 和存储：
 * 公式、单位换算、进度条比例都放这儿，页面只负责显示。
 */
import type {
  HealthActivity,
  HealthFood,
  HealthIntake,
  HealthProfile,
  HealthSex,
} from '@/core/db/schema'

/** 活动系数：Mifflin-St Jeor 之后乘上去，档位只给四档，少一点更好选 */
export const ACTIVITY_FACTORS: Record<HealthActivity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
}

/** 每克三大营养素的热量 */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/** 进度条量程 = TDEE 的多少倍；固定住，每天的刻度位置才可比 */
export const BAR_RATIO = 1.35

/**
 * 三大营养素的颜色：蛋白黄、碳水蓝、脂肪橙。
 * 色相固定（一眼分得出是哪种），但深浅跟主题走——浅色底上要压深才够对比，
 * 所以值是 CSS 变量，由 index.css 按主题给。
 */
export const MACRO_COLORS = {
  protein: 'var(--color-macro-protein)',
  carbs: 'var(--color-macro-carbs)',
  fat: 'var(--color-macro-fat)',
} as const

export type MacroKey = keyof typeof MACRO_COLORS

export const MACRO_KEYS: MacroKey[] = ['protein', 'carbs', 'fat']

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** 数值统一保留两位小数：存储、比较、汇总都用它，别再提前取整 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 展示用：最多两位小数，去掉多余的尾零（120、12.5、12.34） */
export function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return String(round2(value))
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 含数字的字段都齐了才给算，缺一个就返回 null */
export function bmr(input: {
  sex: HealthSex | null
  age: number | null
  heightCm: number | null
  weightKg: number | null
}): number | null {
  const { sex, age, heightCm, weightKg } = input
  if (!sex || !age || !heightCm || !weightKg) return null
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) return null
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return round2(sex === 'male' ? base + 5 : base - 161)
}

/** 用公式估一个 TDEE，只作起点；算不出来就返回 null，让页面提示补字段 */
export function estimateTdee(profile: {
  sex: HealthSex | null
  age: number | null
  heightCm: number | null
  weightKg: number | null
  activity: HealthActivity | null
}): number | null {
  const base = bmr(profile)
  if (base === null) return null
  const factor = ACTIVITY_FACTORS[profile.activity ?? 'sedentary']
  return round2(base * factor)
}

/** 从三大营养素克数反推热量，用来核对食物库里的数字有没有写错 */
export function macroKcal(protein: number, carbs: number, fat: number) {
  return round2(protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat)
}

/** 按克数把一条食物换算成这一次实际吃进去的量 */
export function foodMacros(food: Pick<HealthFood, 'kcal' | 'protein' | 'carbs' | 'fat'>, grams: number): Macros {
  const ratio = Math.max(0, grams) / 100
  return {
    kcal: round2(food.kcal * ratio),
    protein: round(food.protein * ratio),
    carbs: round(food.carbs * ratio),
    fat: round(food.fat * ratio),
  }
}

/** 把一天记下的所有摄入加起来 */
export function sumMacros(list: Macros[]): Macros {
  return list.reduce<Macros>(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      protein: round(total.protein + item.protein),
      carbs: round(total.carbs + item.carbs),
      fat: round(total.fat + item.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/** 套餐实时折算的结果；missing 是引用了但食物库已经删掉的项数 */
export interface MealTotals extends Macros {
  missing: number
  /** 各成分克数之和 */
  grams: number
  /** 组合项总数（含缺的） */
  count: number
}

/**
 * 套餐的营养一律按当前食物库实时算：
 * 食物改名、改营养都跟着走，缺了的项先跳过并记个数，由页面提示替换。
 */
export function mealTotals(
  items: { foodId: string; grams: number }[],
  foods: Pick<HealthFood, 'id' | 'kcal' | 'protein' | 'carbs' | 'fat'>[],
): MealTotals {
  const byId = new Map(foods.map((food) => [food.id, food]))
  const parts: Macros[] = []
  let missing = 0
  let grams = 0
  for (const item of items) {
    const food = byId.get(item.foodId)
    if (!food) {
      missing += 1
      continue
    }
    grams += item.grams
    parts.push(foodMacros(food, item.grams))
  }
  return { ...sumMacros(parts), missing, grams: round(grams), count: items.length }
}

/** 进度条的量程；TDEE 没填就没有刻度 */
export function barScale(tdee: number | null) {
  return tdee && tdee > 0 ? round2(tdee * BAR_RATIO) : 0
}

/** 某个值在量程里的位置（0~100）；超出量程就停在 100 */
export function barPercent(value: number, scale: number) {
  if (scale <= 0) return 0
  return Math.min(100, Math.max(0, (value / scale) * 100))
}

/** 档案里还缺哪几项；空了才算能用 */
export function missingProfileFields(profile: HealthProfile | undefined): string[] {
  if (!profile) return ['sex', 'age', 'heightCm', 'weightKg', 'tdee', 'targetKcal']
  const missing: string[] = []
  if (!profile.sex) missing.push('sex')
  if (!profile.age || profile.age <= 0) missing.push('age')
  if (!profile.heightCm || profile.heightCm <= 0) missing.push('heightCm')
  if (!profile.weightKg || profile.weightKg <= 0) missing.push('weightKg')
  if (!profile.tdee || profile.tdee <= 0) missing.push('tdee')
  if (!profile.targetKcal || profile.targetKcal <= 0) missing.push('targetKcal')
  return missing
}

/** 今天这几条线用哪套数值：TDEE、目标热量、蛋白目标 */
export interface DayTargets {
  tdee: number | null
  targetKcal: number | null
  proteinTarget: number | null
}

/**
 * 每天的目标口径：
 * - 今天用当前档案——档案随时改，今天的线就跟着改；
 * - 过去的日子按「当天第一笔摄入时的档案」快照，改档案不倒改历史；
 * - 今天档案缺项、或旧记录没有快照，回退到能拿到的那一份，保证线总能画出来。
 */
export function dayTargets(
  intakes: Pick<
    HealthIntake,
    'time' | 'createdAt' | 'tdeeSnapshot' | 'targetKcalSnapshot' | 'proteinTargetSnapshot'
  >[],
  profile: HealthProfile | undefined,
  isToday = false,
): DayTargets {
  const fallback: DayTargets = {
    tdee: profile?.tdee ?? null,
    targetKcal: profile?.targetKcal ?? null,
    proteinTarget: profile?.proteinTarget ?? null,
  }
  if (intakes.length === 0) return fallback
  const first = [...intakes].sort(
    (a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt,
  )[0]
  if (isToday) {
    return {
      tdee: profile?.tdee ?? first.tdeeSnapshot ?? null,
      targetKcal: profile?.targetKcal ?? first.targetKcalSnapshot ?? null,
      proteinTarget: profile?.proteinTarget ?? first.proteinTargetSnapshot ?? null,
    }
  }
  return {
    tdee: first.tdeeSnapshot ?? fallback.tdee,
    targetKcal: first.targetKcalSnapshot ?? fallback.targetKcal,
    proteinTarget: first.proteinTargetSnapshot ?? fallback.proteinTarget,
  }
}

/** 还剩多少可以吃；负数表示已经超了 */
export function remainingKcal(target: number | null, eaten: number) {
  if (!target || target <= 0) return null
  return round2(target - eaten)
}

/** 每个预设对应的蛋白系数（g/kg 体重）：减脂要更高来保肌肉，增肌也要够蛋白合成 */
export const PROTEIN_FACTORS: Record<string, number> = {
  maintain: 1.6,
  cut: 1.8,
  bulk: 2.0,
  lowCarb: 1.8,
  steady: 1.6,
}

/** 蛋白目标按体重和当前计划给个建议值；没计划就走维持的 1.6，用户仍可自己改 */
export function suggestProteinForPlan(weightKg: number | null, plan: string | null | undefined) {
  if (!weightKg || weightKg <= 0) return null
  const factor = plan ? PROTEIN_FACTORS[plan] ?? 1.6 : 1.6
  return round2(weightKg * factor)
}

/** 蛋白目标按体重给个建议值，用户仍可自己改 */
export function suggestProteinTarget(weightKg: number | null) {
  if (!weightKg || weightKg <= 0) return null
  return round2(weightKg * 1.6)
}

/**
 * 「帮我判断活动水平」：按每周运动次数和每次时长估一个档位。
 * 只作起点，用户可以再改。
 */
export function activityFromQuestions(
  timesPerWeek: number,
  minutesEach: number,
): HealthActivity {
  if (timesPerWeek <= 0) return 'sedentary'
  if (timesPerWeek <= 2) return minutesEach < 30 ? 'sedentary' : 'light'
  if (timesPerWeek <= 5) {
    if (minutesEach < 30) return 'light'
    if (minutesEach < 60) return 'moderate'
    return 'high'
  }
  return 'high'
}

/** 一个称重点（推算 TDEE 用） */
export interface WeighPoint {
  dateKey: string
  weightKg: number
}

/** 首末称重至少隔一周左右，太密的点算出来只是水分波动 */
export const DERIVED_TDEE_MIN_SPAN_DAYS = 6
/** 窗口里至少要有几天真实摄入记录，不然均值没意义 */
export const DERIVED_TDEE_MIN_INTAKE_DAYS = 5

/** 'YYYY-MM-DD' → 天序号（UTC，避免时区把日期推偏一天） */
function dayNumber(dateKey: string): number {
  const matched = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return NaN
  return Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])) / 86400000
}

/** 这天是星期几：1=周一 … 7=周日；认不出返回 null */
export function weekdayOf(dateKey: string): number | null {
  const n = dayNumber(dateKey)
  if (!Number.isFinite(n)) return null
  return ((n + 3) % 7) + 1
}

/** 今天是不是设好的每周称重日 */
export function isWeighDay(dateKey: string, weighDay: number | null): boolean {
  if (!weighDay) return false
  return weekdayOf(dateKey) === weighDay
}

/**
 * 「推算 TDEE」：不用公式，用真实数据反推。
 * 口径是能量收支：TDEE ≈ 窗口内日均摄入 − 体重日变化 × 7700（每公斤脂肪约 7700 千卡）。
 * 少了 1kg 就是每天多消耗了 7700/跨度；涨了则反过来。
 *
 * 数据不够（称重少于两次、跨度太短、摄入记录太少）一律返回 null——
 * 宁可不画这条线，也不拿三两天的水分波动当代谢。
 */
export function derivedTdee(params: {
  weighIns: WeighPoint[]
  /** 每天摄入热量，'YYYY-MM-DD' → kcal；没记的那天不存在这个键 */
  intakeKcalByDay: Record<string, number>
  /** 回看窗口（天），默认两周——每周称重一次刚好两三个点 */
  windowDays?: number
}): number | null {
  const windowDays = params.windowDays ?? 14
  const points = [...params.weighIns].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  if (points.length < 2) return null
  const endN = dayNumber(points[points.length - 1].dateKey)
  if (!Number.isFinite(endN)) return null
  const inWindow = points.filter((p) => endN - dayNumber(p.dateKey) <= windowDays)
  if (inWindow.length < 2) return null

  const first = inWindow[0]
  const last = inWindow[inWindow.length - 1]
  const firstN = dayNumber(first.dateKey)
  const spanDays = endN - firstN
  if (spanDays < DERIVED_TDEE_MIN_SPAN_DAYS) return null

  let sum = 0
  let recorded = 0
  for (let n = firstN; n <= endN; n += 1) {
    const day = new Date(n * 86400000).toISOString().slice(0, 10)
    const kcal = params.intakeKcalByDay[day]
    if (typeof kcal === 'number' && kcal > 0) {
      sum += kcal
      recorded += 1
    }
  }
  if (recorded < DERIVED_TDEE_MIN_INTAKE_DAYS) return null

  const avgIntake = sum / recorded
  const deltaPerDay = (last.weightKg - first.weightKg) / spanDays
  return round2(avgIntake - deltaPerDay * 7700)
}
