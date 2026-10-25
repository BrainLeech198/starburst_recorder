/**
 * 把不可信的行数据（备份文件、以后的同步包）收成 schema 里定义的样子。
 *
 * 为什么要单独一层：备份是用户唯一能救回数据的东西，而备份文件可能来自
 * 旧版本、别的设备、甚至被手改过。读进来就直接当类型用，会在某个字段缺失时
 * 悄悄写出一条畸形记录，几天后才炸在完全不相干的地方。
 *
 * 规则只有三条，好记也好测：
 *   1. **必填字段缺失或类型不对 → 整行丢掉**，宁可少一条也不要脏数据
 *   2. **可选字段缺失 → 补默认值**，这样旧版本的行在新版本里照样能读
 *   3. **多出来的字段不管**，新版备份拿到旧版应用里也能降级打开
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthActivity,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthMealItem,
  HealthProfile,
  HealthSex,
  IntakeComponent,
  PresetKind,
} from './schema'

/** 日期键：'YYYY-MM-DD'，并且真得是个日历上存在的日子 */
export function toDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return value
}

/** 时刻：'HH:MM'，24 小时制 */
export function toClock(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const matched = value.match(/^(\d{2}):(\d{2})$/)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  return hour < 24 && minute < 60 ? value : null
}

/** 非空字符串；空串和空白都算没填 */
export function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** 数字：也接受 '12.5' 这种字符串写法，手改过的备份很常见 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 非负整数时间戳；缺失或写坏就当 0，不让整行因此被丢 */
export function toStamp(value: unknown): number {
  const parsed = toNumber(value)
  return parsed !== null && parsed >= 0 ? Math.floor(parsed) : 0
}

/** 可空的时间戳：写坏了当没填 */
export function toNullableStamp(value: unknown): number | null {
  const parsed = toNumber(value)
  return parsed !== null && parsed >= 0 ? Math.floor(parsed) : null
}

/** 可空数字；写坏了当没填，不要变成 0 误导统计 */
export function toNullableNumber(value: unknown): number | null {
  return toNumber(value)
}

function toEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

const SEXES: readonly HealthSex[] = ['male', 'female']
const ACTIVITIES: readonly HealthActivity[] = ['sedentary', 'light', 'moderate', 'high']
const PRESET_KINDS: readonly PresetKind[] = ['person', 'place']
const INTAKE_SOURCES = ['library', 'manual'] as const

// ─────────── 日记 ───────────

export function normalizeDiaryEntry(raw: unknown): DiaryEntry | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const dateKey = toDateKey(row.dateKey)
  const content = typeof row.content === 'string' ? row.content : null
  if (!id || !dateKey || content === null) return null
  return {
    id,
    code: toText(row.code) ?? '',
    dateKey,
    content,
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

export function normalizeDiaryDay(raw: unknown): DiaryDay | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const dateKey = toDateKey(row.dateKey)
  if (!dateKey) return null
  return {
    dateKey,
    weather: toText(row.weather),
    updatedAt: toStamp(row.updatedAt),
  }
}

export function normalizeDiaryStamp(raw: unknown): DiaryStamp | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const dateKey = toDateKey(row.dateKey)
  const time = toClock(row.time)
  const content = typeof row.content === 'string' ? row.content : null
  if (!id || !dateKey || !time || content === null) return null
  return {
    id,
    dateKey,
    time,
    content,
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

export function normalizeDiaryPreset(raw: unknown): DiaryPreset | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const kind = toEnum(row.kind, PRESET_KINDS)
  const name = toText(row.name)
  if (!id || !kind || !name) return null
  return {
    id,
    code: toText(row.code) ?? '',
    kind,
    name,
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

// ─────────── 健康 ───────────

export function normalizeHealthProfile(raw: unknown): HealthProfile | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  // 整个应用只有一行，id 固定 'me'；别的 id 直接不要
  if (toText(row.id) !== 'me') return null
  return {
    id: 'me',
    sex: toEnum(row.sex, SEXES),
    age: toNullableNumber(row.age),
    heightCm: toNullableNumber(row.heightCm),
    weightKg: toNullableNumber(row.weightKg),
    weightAt: toNullableStamp(row.weightAt),
    activity: toEnum(row.activity, ACTIVITIES),
    tdee: toNullableNumber(row.tdee),
    targetKcal: toNullableNumber(row.targetKcal),
    proteinTarget: toNullableNumber(row.proteinTarget),
    plan: typeof row.plan === 'string' ? row.plan : '',
    note: typeof row.note === 'string' ? row.note : '',
    updatedAt: toStamp(row.updatedAt),
  }
}

export function normalizeHealthFood(raw: unknown): HealthFood | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const name = toText(row.name)
  const kcal = toNumber(row.kcal)
  if (!id || !name || kcal === null) return null
  return {
    id,
    code: toText(row.code) ?? '',
    name,
    kcal,
    protein: toNumber(row.protein) ?? 0,
    carbs: toNumber(row.carbs) ?? 0,
    fat: toNumber(row.fat) ?? 0,
    servingName: toText(row.servingName),
    servingGrams: toNullableNumber(row.servingGrams),
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

function toMealItem(raw: unknown): HealthMealItem | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const foodId = toText(row.foodId)
  const grams = toNumber(row.grams)
  if (!foodId || grams === null) return null
  return { foodId, grams }
}

export function normalizeHealthMeal(raw: unknown): HealthMeal | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const name = toText(row.name)
  if (!id || !name) return null
  const items = Array.isArray(row.items)
    ? row.items.map(toMealItem).filter((item): item is HealthMealItem => item !== null)
    : []
  return {
    id,
    name,
    items,
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

function toComponent(raw: unknown): IntakeComponent | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const name = toText(row.name)
  if (!name) return null
  return {
    foodId: toText(row.foodId),
    name,
    grams: toNumber(row.grams) ?? 0,
    kcal: toNumber(row.kcal) ?? 0,
    protein: toNumber(row.protein) ?? 0,
    carbs: toNumber(row.carbs) ?? 0,
    fat: toNumber(row.fat) ?? 0,
  }
}

export function normalizeHealthIntake(raw: unknown): HealthIntake | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const dateKey = toDateKey(row.dateKey)
  const time = toClock(row.time)
  const name = toText(row.name)
  const grams = toNumber(row.grams)
  const source = toEnum(row.source, INTAKE_SOURCES)
  if (!id || !dateKey || !time || !name || grams === null || !source) return null

  const components = Array.isArray(row.components)
    ? row.components.map(toComponent).filter((item): item is IntakeComponent => item !== null)
    : null

  return {
    id,
    code: toText(row.code) ?? '',
    dateKey,
    time,
    foodId: toText(row.foodId),
    name,
    grams,
    kcal: toNumber(row.kcal) ?? 0,
    protein: toNumber(row.protein) ?? 0,
    carbs: toNumber(row.carbs) ?? 0,
    fat: toNumber(row.fat) ?? 0,
    source,
    mealId: toText(row.mealId),
    components: components && components.length > 0 ? components : null,
    // 旧记录可能没有这三个快照字段：缺了就当没填，统计时回退到当前目标
    tdeeSnapshot: toNullableNumber(row.tdeeSnapshot),
    targetKcalSnapshot: toNullableNumber(row.targetKcalSnapshot),
    proteinTargetSnapshot: toNullableNumber(row.proteinTargetSnapshot),
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

// ─────────── 经济 ───────────

export function normalizeFinanceEntry(raw: unknown): FinanceEntry | null {
  const row = raw as Record<string, unknown> | null
  if (!row) return null
  const id = toText(row.id)
  const dateKey = toDateKey(row.dateKey)
  const name = toText(row.name)
  const amount = toNumber(row.amount)
  if (!id || !dateKey || !name || amount === null) return null
  return {
    id,
    dateKey,
    name,
    amount,
    note: typeof row.note === 'string' ? row.note : '',
    createdAt: toStamp(row.createdAt),
    updatedAt: toStamp(row.updatedAt),
    deletedAt: toNullableStamp(row.deletedAt),
  }
}

/** 一批行 → 只留下读得懂的那些。丢掉的条数由调用方决定要不要告诉用户 */
export function normalizeRows<T>(rows: unknown[], normalize: (raw: unknown) => T | null): T[] {
  const out: T[] = []
  for (const row of rows) {
    const parsed = normalize(row)
    if (parsed !== null) out.push(parsed)
  }
  return out
}
