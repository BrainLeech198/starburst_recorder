/**
 * 「助手要记一笔」的纯逻辑：把工具参数收成一条动作，并给出人话描述。
 *
 * 这里不碰数据库、不碰 localStorage，Node 环境下可以直接单测；
 * 真正的写入在 assistantActions.ts，模型看不到那一层。
 */
import type { BackupData } from '@/core/db/store'
import type { FinanceKind } from '@/core/db/schema'
import { formatClock, isDateKey, shiftDay } from '@/core/utils/dateKey'
import { FINANCE_CATEGORIES } from '@/features/finance/financeCategories'
import type { AssistantMemoryKind } from './assistantMemory'

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

export interface ActionBuildContext {
  data: BackupData
  today: string
  /** 让「没说具体时刻就记现在」可测 */
  now?: number
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

function clockArg(args: Record<string, unknown>, ctx: ActionBuildContext) {
  const raw = textArg(args, 'time')
  if (CLOCK.test(raw)) return raw
  return formatClock(ctx.now ?? Date.now())
}

function fail(error: string): ActionBuildResult {
  return { ok: false, error }
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
      const day = dayArg(args, ctx)
      if (!day) return fail('日期不对：需要 YYYY-MM-DD，且不能是未来。')
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
  }
}
