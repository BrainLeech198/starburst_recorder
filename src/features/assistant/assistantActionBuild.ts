/**
 * 「助手要记一笔」的纯逻辑：把工具参数收成一条动作，并给出人话描述。
 *
 * 这里不碰数据库、不碰 localStorage，Node 环境下可以直接单测；
 * 真正的写入在 assistantActions.ts，模型看不到那一层。
 * 改一条已有记录永远走「原地改」的动作，不做「删掉再加一条」。
 */
import type { BackupData } from '@/core/db/store'
import type {
  FinanceKind,
  HealthActivity,
  HealthSex,
  ScheduleRepeat,
  HealthTraining,
  PresetKind,
  TrainingKind,
} from '@/core/db/schema'
import { formatClock, isDateKey, shiftDay } from '@/core/utils/dateKey'
import { trainingLabel } from '@/features/training/trainingMath'
import { FINANCE_CATEGORIES } from '@/features/finance/financeCategories'
import { findMemoryByText, type AssistantMemory, type AssistantMemoryKind } from './assistantMemory'

type ProfileFields = {
  sex?: HealthSex
  age?: number
  heightCm?: number
  weightKg?: number
  activity?: HealthActivity
  tdee?: number
  targetKcal?: number
  proteinTarget?: number
  idealBedtime?: string
  idealWakeTime?: string
  note?: string
}

export type AssistantAction =
  | { kind: 'scheduleCreate'; dateKey: string; time: string; title: string; note: string; repeat: ScheduleRepeat; weeklyDays: number[]; remind: boolean }
  | { kind: 'scheduleEdit'; code: string; dateKey: string; title: string; time?: string; newDateKey?: string; newTitle?: string; note?: string; repeat?: ScheduleRepeat; weeklyDays?: number[]; remind?: boolean }
  | { kind: 'scheduleDelete'; code: string; dateKey: string; title: string }
  | { kind: 'memory'; text: string; memoryKind: AssistantMemoryKind }
  | {
      kind: 'finance'
      dateKey: string
      direction: FinanceKind
      name: string
      amount: number
      note: string
      category: string
    }
  | { kind: 'stamp'; dateKey: string; time: string; content: string }
  | { kind: 'diary'; dateKey: string; content: string }
  | {
      kind: 'sleep'
      dateKey: string
      bedtime: string
      wakeTime: string
      quality: number | null
      note: string
      /** 这天已经有睡眠记录：确认后覆盖，而不是再插一条 */
      overwrite: boolean
    }
  | { kind: 'weigh'; dateKey: string; weightKg: number }
  | { kind: 'weighEdit'; dateKey: string; weightKg: number; previousKg: number }
  | {
      kind: 'intake'
      dateKey: string
      time: string
      foodId: string | null
      name: string
      grams: number
      kcal: number
      protein: number
      carbs: number
      fat: number
    }
  | { kind: 'diaryEdit'; code: string; dateKey: string; content: string }
  | {
      kind: 'stampEdit'
      code: string
      dateKey: string
      time?: string
      content?: string
    }
  | {
      kind: 'financeEdit'
      code: string
      dateKey: string
      name?: string
      amount?: number
      direction?: FinanceKind
      category?: string
      note?: string
    }
  | {
      kind: 'financeDelete'
      code: string
      dateKey: string
      name: string
      amount: number
    }
  | { kind: 'stampDelete'; code: string; dateKey: string; content: string }
  | { kind: 'intakeDelete'; code: string; dateKey: string; name: string; kcal: number }
  | {
      kind: 'sleepDelete'
      code: string
      dateKey: string
      bedtime: string
      wakeTime: string
    }
  | { kind: 'diaryDelete'; code: string; dateKey: string; content: string }
  | {
      kind: 'intakeEdit'
      code: string
      dateKey: string
      time?: string
      foodId?: string
      name?: string
      grams?: number
      kcal?: number
      protein?: number
      carbs?: number
      fat?: number
    }
  | {
      kind: 'sleepEdit'
      dateKey: string
      bedtime?: string
      wakeTime?: string
      quality?: number
      note?: string
    }
  | { kind: 'weighDelete'; dateKey: string; weightKg: number; createdAt: number }
  | {
      kind: 'foodCreate'
      name: string
      kcal: number
      protein: number
      carbs: number
      fat: number
      servingName: string | null
      servingGrams: number | null
    }
  | {
      kind: 'foodEdit'
      code: string
      name?: string
      kcal?: number
      protein?: number
      carbs?: number
      fat?: number
      servingName?: string | null
      servingGrams?: number | null
    }
  | { kind: 'foodDelete'; code: string; name: string }
  | { kind: 'mealCreate'; name: string; items: MealItemArg[] }
  | { kind: 'mealEdit'; mealId: string; name?: string; items?: MealItemArg[] }
  | { kind: 'mealDelete'; mealId: string; name: string }
  | { kind: 'presetCreate'; presetKind: PresetKind; name: string }
  | { kind: 'presetEdit'; code: string; name?: string; presetKind?: PresetKind }
  | { kind: 'presetDelete'; code: string; name: string; presetKind: PresetKind }
  | ({ kind: 'profileCreate' } & ProfileFields)
  | ({ kind: 'profileEdit' } & ProfileFields)
  | { kind: 'profileDelete'; weighCount: number; expectedUpdatedAt: number }
  | { kind: 'weatherEdit'; dateKey: string; weather: string }
  | {
      kind: 'training'
      dateKey: string
      time: string
      trainingKind: TrainingKind
      title: string
      exercises: TrainingExerciseArg[]
      durationMin: number | null
      feeling: number | null
      note: string
    }
  | {
      kind: 'trainingEdit'
      code: string
      dateKey: string
      time?: string
      trainingKind?: TrainingKind
      title?: string
      durationMin?: number
      feeling?: number
      note?: string
    }
  | { kind: 'trainingDelete'; code: string; dateKey: string; label: string }
  | {
      kind: 'memoryEdit'
      text: string
      newText?: string
      memoryKind?: AssistantMemoryKind
    }
  | { kind: 'memoryDelete'; text: string; memoryKind: AssistantMemoryKind }

/** 套餐成分：foodId 用来落库，name 只用于描述卡片 */
export interface MealItemArg {
  foodId: string
  name: string
  grams: number
}

/** 训练的一组：没填的字段一律 null */
export interface TrainingSetArg {
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  restSec: number | null
  rpe: number | null
}

export interface TrainingExerciseArg {
  name: string
  kind: TrainingKind
  muscle: string
  sets: TrainingSetArg[]
  durationMin: number | null
  distanceKm: number | null
  note: string
}

export interface ActionBuildContext {
  data: BackupData
  today: string
  /** 让「没说具体时刻就记现在」可测 */
  now?: number
  /** 长期记忆；改删记忆时用来核对原文 */
  memories?: AssistantMemory[]
}

export type ActionBuildResult =
  | { ok: true; action: AssistantAction }
  | { ok: false; error: string }

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function textArg(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function numberArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function round(value: number, digits: number) {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

/** 日期缺省今天；太早、未来、写坏都拒绝，别让模型把记录塞到 1900 年 */
function dayArg(args: Record<string, unknown>, ctx: ActionBuildContext): string | null {
  const raw = textArg(args, 'date') || textArg(args, 'dateKey')
  if (raw === '') return ctx.today
  if (!isDateKey(raw)) return null
  if (raw > ctx.today) return null
  if (raw < shiftDay(ctx.today, -366)) return null
  return raw
}

/** 改已有日期类记录时日期必须显式给，不默认今天 */
function explicitDayArg(args: Record<string, unknown>, ctx: ActionBuildContext): string | null {
  const raw = textArg(args, 'date') || textArg(args, 'dateKey')
  if (!isDateKey(raw)) return null
  if (raw > ctx.today) return null
  if (raw < shiftDay(ctx.today, -366)) return null
  return raw
}

function clockArg(args: Record<string, unknown>, ctx: ActionBuildContext) {
  const raw = textArg(args, 'time')
  if (CLOCK.test(raw)) return raw
  return formatClock(ctx.now ?? Date.now())
}

function fail(error: string): ActionBuildResult {
  return { ok: false, error }
}

function findFood(ctx: ActionBuildContext, code: string) {
  return ctx.data.foods.find((item) => item.deletedAt === null && item.code === code) ?? null
}

/** 套餐没有短编号，只能按 mealId 定位 */
function findMeal(ctx: ActionBuildContext, mealId: string) {
  return ctx.data.meals.find((item) => item.deletedAt === null && item.id === mealId) ?? null
}

function findPreset(ctx: ActionBuildContext, code: string) {
  return ctx.data.presets.find((item) => item.deletedAt === null && item.code === code) ?? null
}

function presetKindArg(raw: string): PresetKind | null {
  if (raw === 'person' || raw === 'place') return raw
  return null
}

/** 每 100g 的三大营养素：0–100 克之间 */
function checkMacro(value: number, label: string): string | null {
  if (value < 0 || value > 100) return `${label}要在 0–100 克之间。`
  return null
}

/**
 * 三大营养素：模型有时平铺，有时套在 nutrition / macros / per100g 里，
 * 键名也见过 protein_g、carbohydrates 这些写法。统一在这里收敛；
 * 一个都没给就返回 null，交给调用方拒绝，而不是悄悄写成 0。
 */
function macroArgs(args: Record<string, unknown>): {
  protein: number | null
  carbs: number | null
  fat: number | null
  nested: Record<string, unknown>
} {
  // 三个嵌套对象可能同时出现（per100g 放热量、nutrition 放三大营养素），合并着找
  const nestedParts = [args.per100g, args.macros, args.nutrition].filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  )
  const nested = Object.assign({}, ...nestedParts)
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const direct = numberArg(args, key)
      if (direct !== null) return direct
      const inner = numberArg(nested, key)
      if (inner !== null) return inner
    }
    return null
  }
  return {
    protein: pick(['protein', 'protein_g', 'proteinG', '蛋白质']),
    carbs: pick(['carbs', 'carbohydrate', 'carbohydrates', 'carbs_g', '碳水']),
    fat: pick(['fat', 'fat_g', 'fatG', '脂肪']),
    nested,
  }
}

/** 套餐成分：每一项都必须在食物库里，克数合理 */
function mealItemsArg(
  raw: unknown,
  ctx: ActionBuildContext,
): { ok: true; items: MealItemArg[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '套餐至少要有一样食物（items）。' }
  }
  const items: MealItemArg[] = []
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const foodId = typeof record.foodId === 'string' ? record.foodId.trim() : ''
    const food = ctx.data.foods.find((item) => item.id === foodId && item.deletedAt === null)
    if (!food) {
      return { ok: false, error: `食物库里找不到 foodId=${foodId || '（空）'}，先用 search_food 查一下。` }
    }
    const grams = numberArg(record, 'grams')
    if (grams === null || grams <= 0 || grams > 5000) {
      return { ok: false, error: '每一项的克数要大于 0、不超过 5000。' }
    }
    items.push({ foodId: food.id, name: food.name, grams: round(grams, 0) })
  }
  if (items.length === 0) return { ok: false, error: '套餐至少要有一样食物。' }
  return { ok: true, items }
}

function memoryArg(
  ctx: ActionBuildContext,
  text: string,
): AssistantMemory | null {
  return findMemoryByText(ctx.memories ?? [], text)
}

/**
 * 把工具名和参数变成一条待确认动作。
 * 不认识的工具、缺参数、库里查不到的食物都在这里拦住，并回一句人话给模型。
 */
const TRAINING_KINDS: TrainingKind[] = ['strength', 'cardio', 'mobility', 'sport', 'other']
const MUSCLE_KEYS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'fullBody',
  'cardio',
  'other',
]

function trainingKindArg(raw: string): TrainingKind {
  return TRAINING_KINDS.includes(raw as TrainingKind) ? (raw as TrainingKind) : 'other'
}

function muscleArg(raw: string): string {
  return MUSCLE_KEYS.includes(raw) ? raw : 'other'
}

/** 组里的数字：越界或坏值当没填，不让脏数字进库 */
function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function trainingSetsArg(raw: unknown): TrainingSetArg[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 30).map((entry) => {
    const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      reps: boundedNumber(record.reps, 0, 1000),
      weightKg: boundedNumber(record.weightKg, 0, 1000),
      durationSec: boundedNumber(record.durationSec, 0, 86400),
      restSec: boundedNumber(record.restSec, 0, 3600),
      rpe: boundedNumber(record.rpe, 1, 10),
    }
  })
}

function trainingExercisesArg(
  raw: unknown,
  fallbackKind: TrainingKind,
): { ok: true; exercises: TrainingExerciseArg[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, exercises: [] }
  if (!Array.isArray(raw)) return { ok: false, error: 'exercises 要是数组。' }
  const exercises: TrainingExerciseArg[] = []
  for (const entry of raw.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const name = textArg(record, 'name')
    if (name === '') continue
    exercises.push({
      name: name.slice(0, 60),
      kind: record.kind === undefined ? fallbackKind : trainingKindArg(textArg(record, 'kind')),
      muscle: muscleArg(textArg(record, 'muscle')),
      sets: trainingSetsArg(record.sets),
      durationMin: boundedNumber(record.durationMin, 0, 1440),
      distanceKm: boundedNumber(record.distanceKm, 0, 1000),
      note: textArg(record, 'note'),
    })
  }
  return { ok: true, exercises }
}

/** 按短编号找训练；编号为空时退回「最近一次」 */
function trainingRef(ctx: ActionBuildContext, code: string): HealthTraining | null {
  const alive = ctx.data.trainings.filter((item) => item.deletedAt === null)
  if (code !== '') return alive.find((item) => item.code === code) ?? null
  return alive.reduce<HealthTraining | null>((best, item) => {
    if (!best) return item
    if (item.dateKey > best.dateKey) return item
    if (item.dateKey === best.dateKey && item.time > best.time) return item
    return best
  }, null)
}

export function buildAssistantAction(
  name: string,
  args: Record<string, unknown>,
  ctx: ActionBuildContext,
): ActionBuildResult {
  switch (name) {
    case 'update_schedule': {
      const code = textArg(args, 'code')
      const item = ctx.data.schedules.find((row) => row.deletedAt === null && row.code === code)
      if (!item) return fail(`找不到编号 ${code || '（空）'} 的日程，先用 search_schedules 查一下。`)
      const action: Extract<AssistantAction, { kind: 'scheduleEdit' }> = {
        kind: 'scheduleEdit', code: item.code, dateKey: item.dateKey, title: item.title,
      }
      if (args.date !== undefined) {
        const date = textArg(args, 'date')
        if (!isDateKey(date)) return fail('日期不对：需要 YYYY-MM-DD。')
        action.newDateKey = date
      }
      if (args.time !== undefined) {
        const time = textArg(args, 'time')
        if (time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail('时刻不对：需要 HH:MM，或留空表示全天。')
        action.time = time
      }
      if (args.title !== undefined) {
        const title = textArg(args, 'title')
        if (!title) return fail('日程标题不能为空。')
        action.newTitle = title.slice(0, 120)
      }
      if (args.note !== undefined) action.note = textArg(args, 'note').slice(0, 1000)
      if (args.repeat !== undefined) {
        const repeat = textArg(args, 'repeat')
        if (repeat !== 'none' && repeat !== 'daily' && repeat !== 'weekly') return fail('重复方式不对。')
        action.repeat = repeat
      }
      if (args.weeklyDays !== undefined) {
        if (!Array.isArray(args.weeklyDays)) return fail('每周重复日需要是 1 到 7 的列表。')
        const days = args.weeklyDays
        if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return fail('每周重复日只能是 1 到 7。')
        action.weeklyDays = [...new Set(days as number[])].sort()
      }
      if (args.remind !== undefined) {
        if (typeof args.remind !== 'boolean') return fail('提醒只能是开或关。')
        action.remind = args.remind
      }
      if (Object.keys(action).length === 4) return fail('至少提供一个要改的字段。')
      const repeat = action.repeat ?? item.repeat
      const days = action.weeklyDays ?? item.weeklyDays
      if (repeat === 'weekly' && days.length === 0) return fail('每周重复时至少选一个星期。')
      if (repeat !== 'weekly') action.weeklyDays = []
      return { ok: true, action }
    }
    case 'delete_schedule': {
      const code = textArg(args, 'code')
      const item = ctx.data.schedules.find((row) => row.deletedAt === null && row.code === code)
      if (!item) return fail(`找不到编号 ${code || '（空）'} 的日程，先用 search_schedules 查一下。`)
      return { ok: true, action: { kind: 'scheduleDelete', code: item.code, dateKey: item.dateKey, title: item.title } }
    }
    case 'add_schedule': {
      const dateKey = textArg(args, 'date') || ctx.today
      if (!isDateKey(dateKey)) return fail('日期不对：需要 YYYY-MM-DD。')
      const title = textArg(args, 'title')
      if (!title) return fail('日程标题不能为空。')
      const time = args.time === undefined ? '09:00' : textArg(args, 'time')
      if (time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail('时刻不对：需要 HH:MM，或留空表示全天。')
      const rawRepeat = textArg(args, 'repeat')
      if (rawRepeat && rawRepeat !== 'none' && rawRepeat !== 'daily' && rawRepeat !== 'weekly') return fail('重复方式不对。')
      const repeat: ScheduleRepeat = rawRepeat === 'daily' || rawRepeat === 'weekly' ? rawRepeat : 'none'
      const weeklyDays = Array.isArray(args.weeklyDays)
        ? [...new Set(args.weeklyDays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7))].sort()
        : []
      if (repeat === 'weekly' && weeklyDays.length === 0) return fail('每周重复时至少选一个星期。')
      return { ok: true, action: {
        kind: 'scheduleCreate', dateKey, time, title: title.slice(0, 120),
        note: textArg(args, 'note').slice(0, 1000), repeat,
        weeklyDays: repeat === 'weekly' ? weeklyDays : [], remind: args.remind === true,
      } }
    }
    case 'remember': {
      const text = textArg(args, 'text')
      if (text === '') return fail('要记住的内容是空的。')
      const rawKind = textArg(args, 'kind')
      const kind: AssistantMemoryKind =
        rawKind === 'preference' || rawKind === 'goal' || rawKind === 'habit' || rawKind === 'fact'
          ? rawKind
          : 'fact'
      return { ok: true, action: { kind: 'memory', text: text.slice(0, 300), memoryKind: kind } }
    }

    case 'add_finance': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const itemName = textArg(args, 'name')
      if (itemName === '') return fail('这笔收支叫什么？name 不能为空。')
      const amount = numberArg(args, 'amount')
      if (amount === null || amount <= 0 || amount > 100000000) {
        return fail('金额要是大于 0 的数字。')
      }
      const direction: FinanceKind = textArg(args, 'direction') === 'income' ? 'income' : 'expense'
      const rawCategory = textArg(args, 'category')
      const category = FINANCE_CATEGORIES.some(
        (item) => item.id === rawCategory && item.kind === direction,
      )
        ? rawCategory
        : ''
      return {
        ok: true,
        action: {
          kind: 'finance',
          dateKey: day,
          direction,
          name: itemName,
          amount: round(amount, 2),
          note: textArg(args, 'note').slice(0, 200),
          category,
        },
      }
    }

    case 'add_stamp': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const content = textArg(args, 'content')
      if (content === '') return fail('随记内容不能为空。')
      return {
        ok: true,
        action: {
          kind: 'stamp',
          dateKey: day,
          time: clockArg(args, ctx),
          content: content.slice(0, 2000),
        },
      }
    }

    case 'add_diary': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const content = textArg(args, 'content')
      if (content === '') return fail('日记内容不能为空。')
      return { ok: true, action: { kind: 'diary', dateKey: day, content: content.slice(0, 20000) } }
    }

    case 'add_sleep': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const bedtime = textArg(args, 'bedtime')
      const wakeTime = textArg(args, 'wakeTime')
      if (!CLOCK.test(bedtime) || !CLOCK.test(wakeTime)) {
        return fail('入睡和起床时刻都要是 HH:MM，例如 23:30、07:10。')
      }
      const rawQuality = numberArg(args, 'quality')
      const quality =
        rawQuality !== null && rawQuality >= 1 && rawQuality <= 5 ? Math.round(rawQuality) : null
      const overwrite = ctx.data.sleeps.some(
        (item) => item.deletedAt === null && item.dateKey === day,
      )
      return {
        ok: true,
        action: {
          kind: 'sleep',
          dateKey: day,
          bedtime,
          wakeTime,
          quality,
          note: textArg(args, 'note').slice(0, 500),
          overwrite,
        },
      }
    }

    case 'add_weigh': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const weightKg = numberArg(args, 'weightKg')
      if (weightKg === null || weightKg < 20 || weightKg > 400) {
        return fail('体重看起来不对：需要在 20–400 kg 之间。')
      }
      if (ctx.data.profile?.weighIns.some((item) => item.dateKey === day)) {
        return fail(`${day} 已有称重；要改这一天的值请用 update_weigh。`)
      }
      return { ok: true, action: { kind: 'weigh', dateKey: day, weightKg: round(weightKg, 1) } }
    }

    case 'update_weigh': {
      const day = explicitDayArg(args, ctx)
      if (!day) return fail('修改称重要指明日期（YYYY-MM-DD）。')
      const item = ctx.data.profile?.weighIns.find((entry) => entry.dateKey === day)
      if (!item) return fail(`${day} 没有称重记录，先用 profile_stats 或 browse_records 查一下。`)
      const weightKg = numberArg(args, 'weightKg')
      if (weightKg === null || weightKg < 20 || weightKg > 400) return fail('体重需要在 20–400 kg 之间。')
      if (round(weightKg, 1) === item.weightKg) return fail('新体重与原记录相同。')
      return { ok: true, action: { kind: 'weighEdit', dateKey: day, weightKg: round(weightKg, 1), previousKg: item.weightKg } }
    }

    case 'add_intake': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const grams = numberArg(args, 'grams')
      if (grams === null || grams <= 0 || grams > 5000) {
        return fail('份量要大于 0 克，且不超过 5000 克。')
      }
      const foodId = textArg(args, 'foodId')
      if (foodId !== '') {
        const food = ctx.data.foods.find((item) => item.id === foodId && item.deletedAt === null)
        if (!food) return fail(`食物库里找不到 foodId=${foodId}，先用 search_food 查一下。`)
        const ratio = grams / 100
        return {
          ok: true,
          action: {
            kind: 'intake',
            dateKey: day,
            time: clockArg(args, ctx),
            foodId: food.id,
            name: food.name,
            grams: round(grams, 0),
            kcal: Math.round(food.kcal * ratio),
            protein: round(food.protein * ratio, 1),
            carbs: round(food.carbs * ratio, 1),
            fat: round(food.fat * ratio, 1),
          },
        }
      }
      const itemName = textArg(args, 'name')
      if (itemName === '') return fail('要记什么食物？name 不能为空。')
      const macros = macroArgs(args)
      const kcal = numberArg(args, 'kcal') ?? numberArg(macros.nested, 'kcal')
      if (kcal === null || kcal < 0 || kcal > 5000) {
        return fail('热量要是不小于 0 的千卡数；不知道就先去食物库查。')
      }
      if (macros.protein === null || macros.carbs === null || macros.fat === null) {
        return fail(
          '这四项要一起给：kcal、protein、carbs、fat。缺的营养按食物名和克数用常识估一个数再调用；只有确实不含才写 0，不要省略，也不要再问用户。',
        )
      }
      return {
        ok: true,
        action: {
          kind: 'intake',
          dateKey: day,
          time: clockArg(args, ctx),
          foodId: null,
          name: itemName,
          grams: round(grams, 0),
          kcal: Math.round(kcal),
          protein: Math.max(0, round(macros.protein, 1)),
          carbs: Math.max(0, round(macros.carbs, 1)),
          fat: Math.max(0, round(macros.fat, 1)),
        },
      }
    }

    case 'add_food': {
      const foodName = textArg(args, 'name')
      if (foodName === '') return fail('食物名不能为空。')
      const macros = macroArgs(args)
      const kcal = numberArg(args, 'kcal') ?? numberArg(macros.nested, 'kcal')
      if (kcal === null || kcal < 0 || kcal > 900) {
        return fail('热量要按每 100g 填，0–900 千卡之间。')
      }
      if (macros.protein === null || macros.carbs === null || macros.fat === null) {
        return fail(
          '营养成分表四项都要按每 100g 给全：kcal、protein、carbs、fat。缺的按同类食物常识估一个数再调用；只有确实不含才写 0，不要省略，也不要再问用户。',
        )
      }
      const macroError =
        checkMacro(macros.protein, '蛋白质') ??
        checkMacro(macros.carbs, '碳水') ??
        checkMacro(macros.fat, '脂肪')
      if (macroError !== null) return fail(macroError)
      const servingName = textArg(args, 'servingName')
      const servingGrams = numberArg(args, 'servingGrams')
      const servingValid = servingGrams !== null && servingGrams > 0 && servingGrams <= 2000
      return {
        ok: true,
        action: {
          kind: 'foodCreate',
          name: foodName.slice(0, 60),
          kcal: round(kcal, 1),
          protein: round(macros.protein, 1),
          carbs: round(macros.carbs, 1),
          fat: round(macros.fat, 1),
          servingName: servingName === '' ? null : servingName.slice(0, 40),
          servingGrams: servingValid ? round(servingGrams, 0) : null,
        },
      }
    }

    case 'add_meal': {
      const mealName = textArg(args, 'name')
      if (mealName === '') return fail('套餐名不能为空。')
      const parsed = mealItemsArg(args.items, ctx)
      if (!parsed.ok) return fail(parsed.error)
      return {
        ok: true,
        action: { kind: 'mealCreate', name: mealName.slice(0, 60), items: parsed.items },
      }
    }

    case 'add_preset': {
      const kind = presetKindArg(textArg(args, 'kind'))
      if (kind === null) return fail('类型要是 person（人名）或 place（地名）。')
      const presetName = textArg(args, 'name')
      if (presetName === '') return fail('预设的名字不能为空。')
      return {
        ok: true,
        action: { kind: 'presetCreate', presetKind: kind, name: presetName.slice(0, 60) },
      }
    }

    case 'create_profile':
    case 'update_profile': {
      if (name === 'create_profile' && ctx.data.profile) return fail('身体档案已经存在，请用 update_profile 修改。')
      if (name === 'update_profile' && !ctx.data.profile) return fail('还没有身体档案，请用 create_profile 创建。')
      const action: Extract<AssistantAction, { kind: 'profileCreate' | 'profileEdit' }> = {
        kind: name === 'create_profile' ? 'profileCreate' : 'profileEdit',
      }
      const rawSex = textArg(args, 'sex')
      if (rawSex !== '') {
        if (rawSex !== 'male' && rawSex !== 'female') return fail('性别只能是 male 或 female。')
        action.sex = rawSex
      }
      const age = numberArg(args, 'age')
      if (age !== null) {
        if (age < 10 || age > 120) return fail('年龄要在 10–120 之间。')
        action.age = Math.round(age)
      }
      const heightCm = numberArg(args, 'heightCm')
      if (heightCm !== null) {
        if (heightCm < 100 || heightCm > 250) return fail('身高要在 100–250 cm 之间。')
        action.heightCm = round(heightCm, 1)
      }
      const weightKg = numberArg(args, 'weightKg')
      if (weightKg !== null) {
        if (weightKg < 20 || weightKg > 400) return fail('体重要在 20–400 kg 之间。')
        action.weightKg = round(weightKg, 1)
      }
      const rawActivity = textArg(args, 'activity')
      if (rawActivity !== '') {
        if (
          rawActivity !== 'sedentary' &&
          rawActivity !== 'light' &&
          rawActivity !== 'moderate' &&
          rawActivity !== 'high'
        ) {
          return fail('活动量只能是 sedentary / light / moderate / high。')
        }
        action.activity = rawActivity
      }
      const tdee = numberArg(args, 'tdee')
      if (tdee !== null) {
        if (tdee < 800 || tdee > 6000) return fail('维持热量要在 800–6000 千卡之间。')
        action.tdee = Math.round(tdee)
      }
      const targetKcal = numberArg(args, 'targetKcal')
      if (targetKcal !== null) {
        if (targetKcal < 500 || targetKcal > 6000) return fail('目标热量要在 500–6000 千卡之间。')
        action.targetKcal = Math.round(targetKcal)
      }
      const proteinTarget = numberArg(args, 'proteinTarget')
      if (proteinTarget !== null) {
        if (proteinTarget < 20 || proteinTarget > 400) {
          return fail('蛋白质目标要在 20–400 克之间。')
        }
        action.proteinTarget = Math.round(proteinTarget)
      }
      const idealBedtime = textArg(args, 'idealBedtime')
      if (idealBedtime !== '') {
        if (!CLOCK.test(idealBedtime)) return fail('理想入睡时刻要是 HH:MM。')
        action.idealBedtime = idealBedtime
      }
      const idealWakeTime = textArg(args, 'idealWakeTime')
      if (idealWakeTime !== '') {
        if (!CLOCK.test(idealWakeTime)) return fail('理想起床时刻要是 HH:MM。')
        action.idealWakeTime = idealWakeTime
      }
      if (typeof args.note === 'string') action.note = textArg(args, 'note').slice(0, 500)
      if (Object.keys(action).length === 1) {
        return fail('至少提供一个要填写的档案字段。')
      }
      return { ok: true, action }
    }

    case 'delete_profile':
      return ctx.data.profile
        ? { ok: true, action: { kind: 'profileDelete', weighCount: ctx.data.profile.weighIns.length, expectedUpdatedAt: ctx.data.profile.updatedAt } }
        : fail('身体档案已经不存在。')

    case 'add_training': {
      const day = dayArg(args, ctx)
      if (day === null) return fail('日期不对，要 YYYY-MM-DD，且不能是未来。')
      const trainingKind = trainingKindArg(textArg(args, 'kind'))
      const parsed = trainingExercisesArg(args.exercises, trainingKind)
      if (!parsed.ok) return fail(parsed.error)
      const durationMin = boundedNumber(args.durationMin, 0, 1440)
      if (parsed.exercises.length === 0 && durationMin === null) {
        return fail('至少要有一个动作，或者一个整场时长（durationMin）。')
      }
      const feeling = boundedNumber(args.feeling, 1, 5)
      return {
        ok: true,
        action: {
          kind: 'training',
          dateKey: day,
          time: clockArg(args, ctx),
          trainingKind,
          title: textArg(args, 'title').slice(0, 60),
          exercises: parsed.exercises,
          durationMin,
          feeling: feeling === null ? null : Math.round(feeling),
          note: textArg(args, 'note'),
        },
      }
    }

    case 'update_training': {
      const target = trainingRef(ctx, textArg(args, 'code'))
      if (!target) return fail('找不到这次训练；先用 training_stats 查一下，或把 code 留空表示最近一次。')
      const action: Extract<AssistantAction, { kind: 'trainingEdit' }> = {
        kind: 'trainingEdit',
        code: target.code,
        dateKey: target.dateKey,
      }
      const day = textArg(args, 'date') || textArg(args, 'dateKey')
      if (day !== '') {
        if (!isDateKey(day) || day > ctx.today) return fail('日期不对，要 YYYY-MM-DD，且不能是未来。')
        action.dateKey = day
      }
      const time = textArg(args, 'time')
      if (time !== '') {
        if (!CLOCK.test(time)) return fail('时刻要 HH:MM。')
        action.time = time
      }
      if (args.kind !== undefined) action.trainingKind = trainingKindArg(textArg(args, 'kind'))
      if (args.title !== undefined) action.title = textArg(args, 'title').slice(0, 60)
      const duration = boundedNumber(args.durationMin, 0, 1440)
      if (duration !== null) action.durationMin = duration
      const feeling = boundedNumber(args.feeling, 1, 5)
      if (feeling !== null) action.feeling = Math.round(feeling)
      if (args.note !== undefined) action.note = textArg(args, 'note')
      if (
        action.time === undefined &&
        action.trainingKind === undefined &&
        action.title === undefined &&
        action.durationMin === undefined &&
        action.feeling === undefined &&
        action.note === undefined &&
        action.dateKey === target.dateKey
      ) {
        return fail('没有要改的字段。')
      }
      return { ok: true, action }
    }

    case 'delete_training': {
      const target = trainingRef(ctx, textArg(args, 'code'))
      if (!target) return fail('找不到这次训练；先用 training_stats 查一下，或把 code 留空表示最近一次。')
      return {
        ok: true,
        action: {
          kind: 'trainingDelete',
          code: target.code,
          dateKey: target.dateKey,
          label: trainingLabel(target) || target.kind,
        },
      }
    }

    case 'update_weather': {
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
      const weather = textArg(args, 'weather').slice(0, 40)
      return { ok: true, action: { kind: 'weatherEdit', dateKey: day, weather } }
    }

    case 'update_diary': {
      const code = textArg(args, 'code')
      const entry = ctx.data.entries.find((item) => item.deletedAt === null && item.code === code)
      if (!entry) return fail(`找不到编号 ${code || '（空）'} 的日记，先用 search_diary 查一下。`)
      const content = textArg(args, 'content')
      if (content === '') return fail('新的正文不能为空。')
      return {
        ok: true,
        action: {
          kind: 'diaryEdit',
          code: entry.code,
          dateKey: entry.dateKey,
          content: content.slice(0, 20000),
        },
      }
    }

    case 'update_stamp': {
      const code = textArg(args, 'code')
      const stamp = ctx.data.stamps.find((item) => item.deletedAt === null && item.code === code)
      if (!stamp) return fail(`找不到编号 ${code || '（空）'} 的随记，先用 search_stamps 查一下。`)
      const time = textArg(args, 'time')
      if (time !== '' && !CLOCK.test(time)) return fail('时刻要是 HH:MM，例如 14:30。')
      const content = textArg(args, 'content')
      if (time === '' && content === '') return fail('要改时刻还是内容？time 和 content 至少给一个。')
      return {
        ok: true,
        action: {
          kind: 'stampEdit',
          code: stamp.code,
          dateKey: stamp.dateKey,
          ...(time === '' ? {} : { time }),
          ...(content === '' ? {} : { content: content.slice(0, 2000) }),
        },
      }
    }

    case 'update_finance': {
      const code = textArg(args, 'code')
      const entry = ctx.data.finance.find((item) => item.deletedAt === null && item.code === code)
      if (!entry) return fail(`找不到编号 ${code || '（空）'} 的收支，先用 finance_stats 查一下。`)
      const name = textArg(args, 'name')
      const amount = numberArg(args, 'amount')
      if (amount !== null && (amount <= 0 || amount > 100000000)) {
        return fail('金额要是大于 0 的数字。')
      }
      const rawDirection = textArg(args, 'direction')
      const direction: FinanceKind | undefined =
        rawDirection === 'income' || rawDirection === 'expense' ? rawDirection : undefined
      const rawCategory = textArg(args, 'category')
      const effectiveKind = direction ?? entry.kind
      if (
        rawCategory !== '' &&
        !FINANCE_CATEGORIES.some((item) => item.id === rawCategory && item.kind === effectiveKind)
      ) {
        return fail(`分类 ${rawCategory} 跟${effectiveKind === 'income' ? '收入' : '支出'}对不上。`)
      }
      const hasNote = typeof args.note === 'string'
      const changed =
        name !== '' ||
        amount !== null ||
        direction !== undefined ||
        rawCategory !== '' ||
        hasNote
      if (!changed) return fail('要改金额、名称、分类还是备注？至少给一个字段。')
      return {
        ok: true,
        action: {
          kind: 'financeEdit',
          code: entry.code,
          dateKey: entry.dateKey,
          ...(name === '' ? {} : { name: name.slice(0, 120) }),
          ...(amount === null ? {} : { amount: round(amount, 2) }),
          ...(direction === undefined ? {} : { direction }),
          ...(rawCategory === '' ? {} : { category: rawCategory }),
          ...(hasNote ? { note: textArg(args, 'note').slice(0, 200) } : {}),
        },
      }
    }

    case 'update_intake': {
      const code = textArg(args, 'code')
      const intake = ctx.data.intakes.find((item) => item.deletedAt === null && item.code === code)
      if (!intake) return fail(`找不到编号 ${code || '（空）'} 的摄入，先用 query_day 查一下。`)
      const action: Extract<AssistantAction, { kind: 'intakeEdit' }> = {
        kind: 'intakeEdit',
        code: intake.code,
        dateKey: intake.dateKey,
      }
      const time = textArg(args, 'time')
      if (time !== '') {
        if (!CLOCK.test(time)) return fail('时刻要是 HH:MM，例如 12:30。')
        action.time = time
      }
      const foodId = textArg(args, 'foodId')
      if (foodId !== '') {
        const food = ctx.data.foods.find((item) => item.id === foodId && item.deletedAt === null)
        if (!food) return fail(`食物库里找不到 foodId=${foodId}，先用 search_food 查一下。`)
        action.foodId = food.id
      }
      const name = textArg(args, 'name')
      if (name !== '') action.name = name.slice(0, 120)
      const grams = numberArg(args, 'grams')
      if (grams !== null) {
        if (grams <= 0 || grams > 5000) return fail('克数要大于 0、不超过 5000。')
        action.grams = round(grams, 0)
      }
      const kcal = numberArg(args, 'kcal')
      if (kcal !== null) {
        if (kcal < 0 || kcal > 5000) return fail('热量要在 0–5000 千卡之间。')
        action.kcal = Math.round(kcal)
      }
      for (const key of ['protein', 'carbs', 'fat'] as const) {
        const value = numberArg(args, key)
        if (value === null) continue
        if (value < 0 || value > 500) return fail('三大营养素要是 0–500 克之间。')
        action[key] = round(value, 1)
      }
      const fields = Object.keys(action).filter((key) => key !== 'kind' && key !== 'code' && key !== 'dateKey')
      if (fields.length === 0) return fail('要改时刻、食物、克数还是热量？至少给一个字段。')
      if (action.foodId !== undefined && action.grams === undefined) {
        // 换成另一种食物却没给克数：用原来那一笔的克数，执行层会按食物库重算营养
        action.grams = intake.grams
      }
      return { ok: true, action }
    }

    case 'update_sleep': {
      const day = explicitDayArg(args, ctx)
      if (!day) return fail('改睡眠要指明日期（起床那天，YYYY-MM-DD）。')
      const sleep = ctx.data.sleeps.find(
        (item) => item.deletedAt === null && item.dateKey === day,
      )
      if (!sleep) return fail(`${day} 没有睡眠记录，要新增就用 add_sleep。`)
      const action: Extract<AssistantAction, { kind: 'sleepEdit' }> = {
        kind: 'sleepEdit',
        dateKey: sleep.dateKey,
      }
      const bedtime = textArg(args, 'bedtime')
      if (bedtime !== '') {
        if (!CLOCK.test(bedtime)) return fail('入睡时刻要是 HH:MM。')
        action.bedtime = bedtime
      }
      const wakeTime = textArg(args, 'wakeTime')
      if (wakeTime !== '') {
        if (!CLOCK.test(wakeTime)) return fail('起床时刻要是 HH:MM。')
        action.wakeTime = wakeTime
      }
      const quality = numberArg(args, 'quality')
      if (quality !== null) {
        if (quality < 1 || quality > 5) return fail('睡眠质量要在 1–5 之间。')
        action.quality = Math.round(quality)
      }
      if (typeof args.note === 'string') action.note = textArg(args, 'note').slice(0, 500)
      if (Object.keys(action).length === 2) {
        return fail('要改入睡、起床、质量还是备注？至少给一个字段。')
      }
      return { ok: true, action }
    }

    case 'delete_diary': {
      const code = textArg(args, 'code')
      const entry = ctx.data.entries.find((item) => item.deletedAt === null && item.code === code)
      if (!entry) return fail(`找不到编号 ${code || '（空）'} 的日记，先用 search_diary 查一下。`)
      return {
        ok: true,
        action: {
          kind: 'diaryDelete',
          code: entry.code,
          dateKey: entry.dateKey,
          content: entry.content.slice(0, 400),
        },
      }
    }

    case 'delete_weigh': {
      const day = explicitDayArg(args, ctx)
      if (!day) return fail('删称重要指明日期（YYYY-MM-DD）。')
      const item = ctx.data.profile?.weighIns.find((entry) => entry.dateKey === day)
      if (!item) return fail(`${day} 没有称重记录。`)
      return {
        ok: true,
        action: {
          kind: 'weighDelete',
          dateKey: item.dateKey,
          weightKg: item.weightKg,
          createdAt: item.createdAt,
        },
      }
    }

    case 'update_food': {
      const code = textArg(args, 'code')
      const food = findFood(ctx, code)
      if (!food) return fail(`找不到编号 ${code || '（空）'} 的食物，先用 search_food 查一下。`)
      const action: Extract<AssistantAction, { kind: 'foodEdit' }> = {
        kind: 'foodEdit',
        code: food.code,
      }
      const name = textArg(args, 'name')
      if (name !== '') action.name = name.slice(0, 60)
      const kcal = numberArg(args, 'kcal')
      if (kcal !== null) {
        if (kcal < 0 || kcal > 900) return fail('热量要按每 100g 填，0–900 千卡之间。')
        action.kcal = round(kcal, 1)
      }
      for (const key of ['protein', 'carbs', 'fat'] as const) {
        const value = numberArg(args, key)
        if (value === null) continue
        const label = key === 'protein' ? '蛋白质' : key === 'carbs' ? '碳水' : '脂肪'
        const macroError = checkMacro(value, label)
        if (macroError !== null) return fail(macroError)
        action[key] = round(value, 1)
      }
      if (typeof args.servingName === 'string') {
        action.servingName = textArg(args, 'servingName').slice(0, 40) || null
      }
      const servingGrams = numberArg(args, 'servingGrams')
      if (servingGrams !== null) {
        if (servingGrams <= 0 || servingGrams > 2000) {
          return fail('常用份量的克数要大于 0、不超过 2000。')
        }
        action.servingGrams = round(servingGrams, 0)
      }
      if (Object.keys(action).length === 2) {
        return fail('要改名称、营养还是常用份量？至少给一个字段。')
      }
      return { ok: true, action }
    }

    case 'delete_food': {
      const code = textArg(args, 'code')
      const food = findFood(ctx, code)
      if (!food) return fail(`找不到编号 ${code || '（空）'} 的食物，先用 search_food 查一下。`)
      return { ok: true, action: { kind: 'foodDelete', code: food.code, name: food.name } }
    }

    case 'update_meal': {
      const mealId = textArg(args, 'mealId') || textArg(args, 'id')
      const meal = findMeal(ctx, mealId)
      if (!meal) return fail(`找不到 mealId=${mealId || '（空）'} 的套餐，先用 search_meals 查一下。`)
      const action: Extract<AssistantAction, { kind: 'mealEdit' }> = {
        kind: 'mealEdit',
        mealId: meal.id,
      }
      const mealName = textArg(args, 'name')
      if (mealName !== '') action.name = mealName.slice(0, 60)
      if (Array.isArray(args.items)) {
        const parsed = mealItemsArg(args.items, ctx)
        if (!parsed.ok) return fail(parsed.error)
        action.items = parsed.items
      }
      if (Object.keys(action).length === 2) {
        return fail('要改套餐名还是成分？至少给一个。')
      }
      return { ok: true, action }
    }

    case 'delete_meal': {
      const mealId = textArg(args, 'mealId') || textArg(args, 'id')
      const meal = findMeal(ctx, mealId)
      if (!meal) return fail(`找不到 mealId=${mealId || '（空）'} 的套餐，先用 search_meals 查一下。`)
      return { ok: true, action: { kind: 'mealDelete', mealId: meal.id, name: meal.name } }
    }

    case 'update_preset': {
      const code = textArg(args, 'code')
      const preset = findPreset(ctx, code)
      if (!preset) return fail(`找不到编号 ${code || '（空）'} 的预设，刷新后再看一次。`)
      const action: Extract<AssistantAction, { kind: 'presetEdit' }> = {
        kind: 'presetEdit',
        code: preset.code,
      }
      const presetName = textArg(args, 'name')
      if (presetName !== '') action.name = presetName.slice(0, 60)
      const rawKind = textArg(args, 'kind')
      if (rawKind !== '') {
        const kind = presetKindArg(rawKind)
        if (kind === null) return fail('类型要是 person（人名）或 place（地名）。')
        action.presetKind = kind
      }
      if (Object.keys(action).length === 2) {
        return fail('要改名字还是类型？至少给一个。')
      }
      return { ok: true, action }
    }

    case 'delete_preset': {
      const code = textArg(args, 'code')
      const preset = findPreset(ctx, code)
      if (!preset) return fail(`找不到编号 ${code || '（空）'} 的预设，刷新后再看一次。`)
      return {
        ok: true,
        action: { kind: 'presetDelete', code: preset.code, name: preset.name, presetKind: preset.kind },
      }
    }

    case 'update_memory': {
      const text = textArg(args, 'text')
      if (text === '') return fail('要改哪条记忆？text 传原文。')
      const memory = memoryArg(ctx, text)
      if (!memory) return fail('没找到这条记忆，先用 list_memory 看一下原文。')
      const action: Extract<AssistantAction, { kind: 'memoryEdit' }> = {
        kind: 'memoryEdit',
        text: memory.text,
      }
      if (typeof args.newText === 'string') {
        const newText = textArg(args, 'newText')
        if (newText === '') return fail('新的记忆文字不能为空。')
        action.newText = newText.slice(0, 300)
      }
      const rawKind = textArg(args, 'kind')
      if (rawKind !== '') {
        if (
          rawKind !== 'preference' &&
          rawKind !== 'goal' &&
          rawKind !== 'habit' &&
          rawKind !== 'fact'
        ) {
          return fail('记忆分类只能是 preference / goal / habit / fact。')
        }
        action.memoryKind = rawKind
      }
      if (action.newText === undefined && action.memoryKind === undefined) {
        return fail('要改文字还是分类？至少给一个。')
      }
      return { ok: true, action }
    }

    case 'delete_memory': {
      const text = textArg(args, 'text')
      if (text === '') return fail('要删哪条记忆？text 传原文。')
      const memory = memoryArg(ctx, text)
      if (!memory) return fail('没找到这条记忆，先用 list_memory 看一下原文。')
      return {
        ok: true,
        action: { kind: 'memoryDelete', text: memory.text, memoryKind: memory.kind },
      }
    }

    case 'delete_finance': {
      const code = textArg(args, 'code')
      const entry = ctx.data.finance.find((item) => item.deletedAt === null && item.code === code)
      if (!entry) return fail(`找不到编号 ${code || '（空）'} 的收支，先用 finance_stats 查一下。`)
      return {
        ok: true,
        action: {
          kind: 'financeDelete',
          code: entry.code,
          dateKey: entry.dateKey,
          name: entry.name,
          amount: entry.amount,
        },
      }
    }

    case 'delete_stamp': {
      const code = textArg(args, 'code')
      const stamp = ctx.data.stamps.find((item) => item.deletedAt === null && item.code === code)
      if (!stamp) return fail(`找不到编号 ${code || '（空）'} 的随记，先用 search_stamps 查一下。`)
      return {
        ok: true,
        action: {
          kind: 'stampDelete',
          code: stamp.code,
          dateKey: stamp.dateKey,
          content: stamp.content.slice(0, 400),
        },
      }
    }

    case 'delete_intake': {
      const code = textArg(args, 'code')
      const intake = ctx.data.intakes.find((item) => item.deletedAt === null && item.code === code)
      if (!intake) return fail(`找不到编号 ${code || '（空）'} 的摄入，先用 query_day 查一下。`)
      return {
        ok: true,
        action: {
          kind: 'intakeDelete',
          code: intake.code,
          dateKey: intake.dateKey,
          name: intake.name,
          kcal: Math.round(intake.kcal),
        },
      }
    }

    case 'delete_sleep': {
      const day = explicitDayArg(args, ctx)
      if (!day) return fail('删睡眠要指明日期（起床那天，YYYY-MM-DD）。')
      const sleep = ctx.data.sleeps.find((item) => item.deletedAt === null && item.dateKey === day)
      if (!sleep) return fail(`${day} 没有睡眠记录。`)
      return {
        ok: true,
        action: {
          kind: 'sleepDelete',
          code: sleep.code,
          dateKey: sleep.dateKey,
          bedtime: sleep.bedtime,
          wakeTime: sleep.wakeTime,
        },
      }
    }

    default:
      return fail(`没有叫 ${name} 的动作。`)
  }
}

/** 给模型看的动作描述（中文固定），也用于「已确认写入」的上下文 */
export function describeAction(action: AssistantAction): string {
  switch (action.kind) {
    case 'scheduleCreate':
      return `${action.dateKey} ${action.time || '全天'} 新增日程「${action.title}」${action.repeat === 'none' ? '' : action.repeat === 'daily' ? '（每天）' : `（每周 ${action.weeklyDays.join('、')}）`}${action.remind ? '，到点提醒' : ''}`
    case 'scheduleEdit':
      return `修改日程（${action.code}）「${action.title}」：${[
        action.newDateKey ? `日期 ${action.newDateKey}` : '',
        action.time === undefined ? '' : `时刻 ${action.time || '全天'}`,
        action.newTitle ? `标题 ${action.newTitle}` : '',
        action.note === undefined ? '' : `备注 ${action.note || '清空'}`,
        action.repeat ? `重复 ${action.repeat}` : '',
        action.weeklyDays ? `周几 ${action.weeklyDays.join('、') || '无'}` : '',
        action.remind === undefined ? '' : `提醒 ${action.remind ? '开' : '关'}`,
      ].filter(Boolean).join('；')}`
    case 'scheduleDelete':
      return `${action.dateKey} 删除日程「${action.title}」（${action.code}），移入回收站`
    case 'memory':
      return `记住「${action.text}」`
    case 'finance':
      return `${action.dateKey} ${action.direction === 'income' ? '收入' : '支出'}：${action.name} ${
        action.amount
      } 元${action.note ? `（${action.note}）` : ''}`
    case 'stamp':
      return `${action.dateKey} ${action.time} 随记：${action.content}`
    case 'diary':
      return `${action.dateKey} 日记：${action.content}`
    case 'sleep':
      return `${action.dateKey} 睡眠：${action.bedtime}→${action.wakeTime}${
        action.quality === null ? '' : `，质量 ${action.quality}/5`
      }`
    case 'weigh':
      return `${action.dateKey} 体重：${action.weightKg} kg`
    case 'weighEdit':
      return `${action.dateKey} 修改体重：${action.previousKg} → ${action.weightKg} kg`
    case 'intake':
      return `${action.dateKey} ${action.time} 摄入：${action.name} ${action.grams}g，${action.kcal} 千卡`
    case 'diaryEdit':
      return `${action.dateKey} 改写日记（${action.code}）：${action.content}`
    case 'stampEdit':
      return `${action.dateKey} 改随记（${action.code}）：${action.time ?? ''}${
        action.time && action.content ? ' ' : ''
      }${action.content ?? ''}`
    case 'financeEdit':
      return `${action.dateKey} 改收支（${action.code}）`
    case 'financeDelete':
      return `${action.dateKey} 删除收支：${action.name} ${action.amount} 元`
    case 'stampDelete':
      return `${action.dateKey} 删除随记：${action.content}`
    case 'intakeDelete':
      return `${action.dateKey} 删除摄入：${action.name}，${action.kcal} 千卡`
    case 'sleepDelete':
      return `${action.dateKey} 删除睡眠：${action.bedtime}→${action.wakeTime}`
    case 'diaryDelete':
      return `${action.dateKey} 删除日记（${action.code}）：${action.content}`
    case 'intakeEdit':
      return `${action.dateKey} 原地改摄入（${action.code}）${
        action.name === undefined ? '' : `：${action.name}`
      }${action.grams === undefined ? '' : ` ${action.grams}g`}${
        action.kcal === undefined ? '' : `，${action.kcal} 千卡`
      }`
    case 'sleepEdit':
      return `${action.dateKey} 原地改睡眠${
        action.bedtime && action.wakeTime ? `：${action.bedtime}→${action.wakeTime}` : ''
      }`
    case 'weighDelete':
      return `${action.dateKey} 删除称重：${action.weightKg} kg`
    case 'foodCreate':
      return `食物库新增「${action.name}」：每 100g ${action.kcal} 千卡`
    case 'foodEdit':
      return `改食物库（${action.code}）${action.name ? `：${action.name}` : ''}`
    case 'foodDelete':
      return `删除食物库「${action.name}」`
    case 'mealCreate':
      return `套餐库新增「${action.name}」：${action.items
        .map((item) => `${item.name} ${item.grams}g`)
        .join(' + ')}`
    case 'mealEdit':
      return `改套餐${action.name ? `：${action.name}` : ''}${
        action.items ? `（${action.items.map((item) => `${item.name} ${item.grams}g`).join(' + ')}）` : ''
      }`
    case 'mealDelete':
      return `删除套餐「${action.name}」`
    case 'presetCreate':
      return `预设库新增${action.presetKind === 'person' ? '人名' : '地名'}「${action.name}」`
    case 'presetEdit':
      return `改预设（${action.code}）${action.name ? `：${action.name}` : ''}`
    case 'presetDelete':
      return `删除预设「${action.name}」`
    case 'training': {
      const label = action.title || action.exercises[0]?.name || '训练'
      const sets = action.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
      return `${action.dateKey} ${action.time} 训练：${label}，${action.exercises.length} 个动作${
        sets > 0 ? ` · ${sets} 组` : ''
      }`
    }
    case 'trainingEdit':
      return `${action.dateKey} 改训练（${action.code}）`
    case 'trainingDelete':
      return `${action.dateKey} 删除训练：${action.label}`
    case 'profileEdit':
      return '改身体档案'
    case 'profileCreate':
      return '新建身体档案'
    case 'profileDelete':
      return `删除身体档案及 ${action.weighCount} 条称重记录`
    case 'weatherEdit':
      return `${action.dateKey} 天气：${action.weather || '清空'}`
    case 'memoryEdit':
      return `改记忆：${action.newText ?? action.text}`
    case 'memoryDelete':
      return `删掉记忆「${action.text}」`
  }
}
