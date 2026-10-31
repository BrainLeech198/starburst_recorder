/**
 * 待确认动作的真正执行层。
 *
 * 模型只负责提出一条动作，真正写库永远发生在用户点「确认」之后：
 *   assistantActionBuild.ts → 参数校验与描述（纯函数）
 *   executeAssistantAction → 写库，并留下撤销所需的最小信息
 *   undoAssistantAction → 按同样的信息撤回
 *
 * 撤销信息可以序列化（recordId / previous），所以刷新页面后
 * 之前确认过的条目仍然能撤销。
 */
import type { HealthProfile, HealthSleep } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import {
  addStamp,
  createEntry,
  removeEntry,
  removeStamp,
  updateContent,
  updateStamp,
} from '@/features/diary/diaryRepo'
import { addFinance, removeFinance } from '@/features/finance/financeRepo'
import {
  addIntake,
  healthProfile,
  removeHealthSleep,
  removeIntake,
  saveHealthProfile,
  saveHealthSleep,
  sleepOfDay,
} from '@/features/health/healthRepo'
import {
  addMemory,
  loadMemories,
  removeMemory,
  updateMemory,
  type AssistantMemoryKind,
} from './assistantMemory'
import type { AssistantAction } from './assistantActionBuild'

export type { AssistantAction, ActionBuildContext } from './assistantActionBuild'
export {
  buildAssistantAction,
  describeAction,
} from './assistantActionBuild'

/** 撤销需要的最小信息；要能 JSON 序列化，刷新后还能用 */
export interface ActionDone {
  recordId: string | null
  previous?: unknown
}

/**
 * 真正写库。动作来自用户确认过的卡片，所以这里不再问第二次。
 * 失败直接抛错，由界面显示原因，不静默吞掉。
 */
export async function executeAssistantAction(action: AssistantAction): Promise<ActionDone> {
  const now = Date.now()

  if (action.kind === 'memory') {
    const before = loadMemories().find(
      (item) => item.text.toLowerCase() === action.text.toLowerCase(),
    )
    const result = addMemory({
      text: action.text,
      kind: action.memoryKind,
      source: 'assistant',
    })
    if (!result) throw new Error('记忆内容为空')
    return { recordId: result.memory.id, previous: before ?? null }
  }

  if (action.kind === 'finance') {
    const entry = {
      id: newId(),
      code: newCode(),
      dateKey: action.dateKey,
      kind: action.direction,
      category: action.category,
      name: action.name,
      amount: action.amount,
      note: action.note,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await addFinance(entry)
    return { recordId: entry.id }
  }

  if (action.kind === 'stamp') {
    const stamp = await addStamp(action.dateKey)
    await updateStamp(stamp.id, { time: action.time, content: action.content })
    return { recordId: stamp.id }
  }

  if (action.kind === 'diary') {
    const entry = await createEntry(action.dateKey)
    await updateContent(entry.id, action.content, [])
    return { recordId: entry.id }
  }

  if (action.kind === 'sleep') {
    const existing = await sleepOfDay(action.dateKey)
    const next: HealthSleep = existing
      ? {
          ...existing,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
          quality: action.quality,
          note: action.note,
          updatedAt: now,
        }
      : {
          id: newId(),
          code: newCode(),
          dateKey: action.dateKey,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
          quality: action.quality,
          wakeEvents: [],
          wakeCount: null,
          wakeMinutes: null,
          note: action.note,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
    await saveHealthSleep(next)
    return { recordId: next.id, previous: existing ?? null }
  }

  if (action.kind === 'weigh') {
    const profile = await healthProfile()
    if (!profile) throw new Error('还没有身体档案，先补几项基本信息再记体重。')
    const weighIns = [
      { dateKey: action.dateKey, weightKg: action.weightKg, createdAt: now },
      ...profile.weighIns.filter((item) => item.dateKey !== action.dateKey),
    ].slice(0, 120)
    const next: HealthProfile = {
      ...profile,
      weightKg: action.weightKg,
      weightAt: now,
      weighIns,
      updatedAt: now,
    }
    await saveHealthProfile(next)
    return { recordId: profile.id, previous: profile }
  }

  const intake = {
    id: newId(),
    code: newCode(),
    dateKey: action.dateKey,
    time: action.time,
    foodId: action.foodId,
    name: action.name,
    grams: action.grams,
    kcal: action.kcal,
    protein: action.protein,
    carbs: action.carbs,
    fat: action.fat,
    source: action.foodId ? ('library' as const) : ('manual' as const),
    mealId: null,
    components: null,
    tdeeSnapshot: null,
    targetKcalSnapshot: null,
    proteinTargetSnapshot: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await addIntake(intake)
  return { recordId: intake.id }
}

/** 撤回一条已经写入的动作；找不到原记录时安静结束，不弹一堆「已经没了」 */
export async function undoAssistantAction(action: AssistantAction, done: ActionDone) {
  if (action.kind === 'memory') {
    const previous = done.previous as {
      id?: string
      text?: string
      kind?: AssistantMemoryKind
    } | null
    if (previous && previous.id && previous.text) {
      updateMemory(previous.id, { text: previous.text, kind: previous.kind })
    } else if (done.recordId) {
      removeMemory(done.recordId)
    }
    return
  }

  if (action.kind === 'weigh') {
    const previous = done.previous as HealthProfile | null
    const current = await healthProfile()
    if (!current) {
      if (previous) await saveHealthProfile(previous)
      return
    }
    // 只摘掉这次加的那一条，别把用户之后改过的档案整体覆盖回去
    const weighIns = current.weighIns.filter(
      (item) => !(item.dateKey === action.dateKey && item.weightKg === action.weightKg),
    )
    const latest = weighIns[0]
    if (latest) {
      await saveHealthProfile({
        ...current,
        weightKg: latest.weightKg,
        weightAt: latest.createdAt,
        weighIns,
        updatedAt: Date.now(),
      })
    } else if (previous) {
      await saveHealthProfile(previous)
    } else {
      await saveHealthProfile({ ...current, weighIns, updatedAt: Date.now() })
    }
    return
  }

  if (!done.recordId) return
  if (action.kind === 'finance') await removeFinance(done.recordId)
  else if (action.kind === 'stamp') await removeStamp(done.recordId)
  else if (action.kind === 'diary') await removeEntry(done.recordId)
  else if (action.kind === 'intake') await removeIntake(done.recordId)
  else if (action.kind === 'sleep') {
    const previous = done.previous as HealthSleep | null
    if (previous) await saveHealthSleep(previous)
    else await removeHealthSleep(done.recordId)
  }
}
