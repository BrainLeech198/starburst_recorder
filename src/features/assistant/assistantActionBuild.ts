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
  PresetKind,
} from '@/core/db/schema'
import { formatClock, isDateKey, shiftDay } from '@/core/utils/dateKey'
import { FINANCE_CATEGORIES } from '@/features/finance/financeCategories'
import { findMemoryByText, type AssistantMemory, type AssistantMemoryKind } from './assistantMemory'

export type AssistantAction =
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
  | {
      kind: 'profileEdit'
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
  | { kind: 'weatherEdit'; dateKey: string; weather: string }
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
export function buildAssistantAction(
  name: string,
  args: Record<string, unknown>,
  ctx: ActionBuildContext,
): ActionBuildResult {
  switch (name) {
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
      return { ok: true, action: { kind: 'weigh', dateKey: day, weightKg: round(weightKg, 1) } }
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
      const kcal = numberArg(args, 'kcal')
      if (kcal === null || kcal < 0 || kcal > 5000) {
        return fail('热量要是不小于 0 的千卡数；不知道就先去食物库查。')
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
          protein: Math.max(0, round(numberArg(args, 'protein') ?? 0, 1)),
          carbs: Math.max(0, round(numberArg(args, 'carbs') ?? 0, 1)),
          fat: Math.max(0, round(numberArg(args, 'fat') ?? 0, 1)),
        },
      }
    }

    case 'add_food': {
      const foodName = textArg(args, 'name')
      if (foodName === '') return fail('食物名不能为空。')
      const kcal = numberArg(args, 'kcal')
      if (kcal === null || kcal < 0 || kcal > 900) {
        return fail('热量要按每 100g 填，0–900 千卡之间。')
      }
      const protein = numberArg(args, 'protein') ?? 0
      const carbs = numberArg(args, 'carbs') ?? 0
      const fat = numberArg(args, 'fat') ?? 0
      const macroError =
        checkMacro(protein, '蛋白质') ?? checkMacro(carbs, '碳水') ?? checkMacro(fat, '脂肪')
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
          protein: round(protein, 1),
          carbs: round(carbs, 1),
          fat: round(fat, 1),
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

    case 'update_profile': {
      const action: Extract<AssistantAction, { kind: 'profileEdit' }> = { kind: 'profileEdit' }
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
        return fail('要改档案的哪一项？至少给一个字段。')
      }
      return { ok: true, action }
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
    case 'profileEdit':
      return '改身体档案'
    case 'weatherEdit':
      return `${action.dateKey} 天气：${action.weather || '清空'}`
    case 'memoryEdit':
      return `改记忆：${action.newText ?? action.text}`
    case 'memoryDelete':
      return `删掉记忆「${action.text}」`
  }
}
