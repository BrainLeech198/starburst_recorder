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
import type {
  DiaryDay,
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
  HealthSleep,
} from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import {
  addStamp,
  createEntry,
  removeDiaryPreset,
  removeEntry,
  removeStamp,
  restoreDiaryPreset,
  restoreEntry,
  restoreStamp,
  saveDiaryPreset,
  setWeather,
  updateContent,
  updateStamp,
} from '@/features/diary/diaryRepo'
import { addFinance, removeFinance, restoreFinance, saveFinance } from '@/features/finance/financeRepo'
import {
  addIntake,
  exportAllData,
  healthProfile,
  removeHealthFood,
  removeHealthMeal,
  removeHealthSleep,
  removeIntake,
  restoreHealthFood,
  restoreHealthMeal,
  restoreHealthSleep,
  restoreIntake,
  saveHealthFood,
  saveHealthMeal,
  saveHealthProfile,
  saveHealthSleep,
  saveIntake,
  sleepOfDay,
} from '@/features/health/healthRepo'
import {
  addMemory,
  findMemoryByText,
  loadMemories,
  removeMemory,
  updateMemory,
  type AssistantMemory,
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
  const data = await exportAllData()

  if (action.kind === 'diaryEdit') {
    const entry = data.entries.find((item) => item.deletedAt === null && item.code === action.code)
    if (!entry) throw new Error('这篇日记已经不在了，刷新后再看一次。')
    await updateContent(entry.id, action.content, entry.images)
    return { recordId: entry.id, previous: entry }
  }

  if (action.kind === 'stampEdit') {
    const stamp = data.stamps.find((item) => item.deletedAt === null && item.code === action.code)
    if (!stamp) throw new Error('这条随记已经不在了，刷新后再看一次。')
    await updateStamp(stamp.id, {
      ...(action.time === undefined ? {} : { time: action.time }),
      ...(action.content === undefined ? {} : { content: action.content }),
    })
    return { recordId: stamp.id, previous: stamp }
  }

  if (action.kind === 'financeEdit') {
    const entry = data.finance.find((item) => item.deletedAt === null && item.code === action.code)
    if (!entry) throw new Error('这笔收支已经不在了，刷新后再看一次。')
    const patch: Partial<FinanceEntry> = {
      ...(action.name === undefined ? {} : { name: action.name }),
      ...(action.amount === undefined ? {} : { amount: action.amount }),
      ...(action.direction === undefined ? {} : { kind: action.direction }),
      ...(action.category === undefined ? {} : { category: action.category }),
      ...(action.note === undefined ? {} : { note: action.note }),
    }
    await saveFinance({ ...entry, ...patch, updatedAt: now })
    return { recordId: entry.id, previous: entry }
  }

  if (action.kind === 'financeDelete' || action.kind === 'stampDelete' || action.kind === 'intakeDelete') {
    const record =
      action.kind === 'financeDelete'
        ? data.finance.find((item) => item.deletedAt === null && item.code === action.code)
        : action.kind === 'stampDelete'
          ? data.stamps.find((item) => item.deletedAt === null && item.code === action.code)
          : data.intakes.find((item) => item.deletedAt === null && item.code === action.code)
    if (!record) throw new Error('这条记录已经不在了，刷新后再看一次。')
    if (action.kind === 'financeDelete') await removeFinance(record.id)
    else if (action.kind === 'stampDelete') await removeStamp(record.id)
    else await removeIntake(record.id)
    return { recordId: record.id, previous: record }
  }

  if (action.kind === 'sleepDelete') {
    const sleep = data.sleeps.find((item) => item.deletedAt === null && item.dateKey === action.dateKey)
    if (!sleep) throw new Error('这天的睡眠记录已经不在了。')
    await removeHealthSleep(sleep.id)
    return { recordId: sleep.id, previous: sleep }
  }

  if (action.kind === 'diaryDelete') {
    const entry = data.entries.find((item) => item.deletedAt === null && item.code === action.code)
    if (!entry) throw new Error('这篇日记已经不在了，刷新后再看一次。')
    await removeEntry(entry.id)
    return { recordId: entry.id, previous: entry }
  }

  if (action.kind === 'intakeEdit') {
    const intake = data.intakes.find((item) => item.deletedAt === null && item.code === action.code)
    if (!intake) throw new Error('这笔摄入已经不在了，刷新后再看一次。')
    let patch: Partial<HealthIntake> = {
      ...(action.time === undefined ? {} : { time: action.time }),
      ...(action.name === undefined ? {} : { name: action.name }),
      ...(action.grams === undefined ? {} : { grams: action.grams }),
      ...(action.kcal === undefined ? {} : { kcal: action.kcal }),
      ...(action.protein === undefined ? {} : { protein: action.protein }),
      ...(action.carbs === undefined ? {} : { carbs: action.carbs }),
      ...(action.fat === undefined ? {} : { fat: action.fat }),
    }
    // 换了食物、或者只改了克数又没给热量：按食物库重算，别留着旧营养
    const foodId = action.foodId ?? intake.foodId
    const reweigh = action.foodId !== undefined || (action.grams !== undefined && action.kcal === undefined)
    if (foodId && reweigh) {
      const food = data.foods.find((item) => item.id === foodId && item.deletedAt === null)
      if (food) {
        const grams = action.grams ?? intake.grams
        const ratio = grams / 100
        patch = {
          ...patch,
          foodId: food.id,
          name: food.name,
          grams,
          kcal: Math.round(food.kcal * ratio),
          protein: Math.round(food.protein * ratio * 10) / 10,
          carbs: Math.round(food.carbs * ratio * 10) / 10,
          fat: Math.round(food.fat * ratio * 10) / 10,
          source: 'library',
        }
      } else if (action.foodId !== undefined) {
        throw new Error('食物库里没有这条食物了，刷新后再试。')
      }
    }
    await saveIntake({ ...intake, ...patch, updatedAt: now })
    return { recordId: intake.id, previous: intake }
  }

  if (action.kind === 'sleepEdit') {
    const sleep = data.sleeps.find((item) => item.deletedAt === null && item.dateKey === action.dateKey)
    if (!sleep) throw new Error('这天的睡眠记录已经不在了。')
    const next: HealthSleep = {
      ...sleep,
      ...(action.bedtime === undefined ? {} : { bedtime: action.bedtime }),
      ...(action.wakeTime === undefined ? {} : { wakeTime: action.wakeTime }),
      ...(action.quality === undefined ? {} : { quality: action.quality }),
      ...(action.note === undefined ? {} : { note: action.note }),
      updatedAt: now,
    }
    await saveHealthSleep(next)
    return { recordId: sleep.id, previous: sleep }
  }

  if (action.kind === 'weighDelete') {
    const profile = await healthProfile()
    if (!profile) throw new Error('还没有身体档案。')
    const weighIns = profile.weighIns.filter((item) => item.dateKey !== action.dateKey)
    const newest = weighIns.reduce<(typeof weighIns)[number] | null>(
      (acc, item) => (acc === null || item.dateKey > acc.dateKey ? item : acc),
      null,
    )
    await saveHealthProfile({
      ...profile,
      weighIns,
      weightKg: newest ? newest.weightKg : profile.weightKg,
      weightAt: newest ? newest.createdAt : profile.weightAt,
      updatedAt: now,
    })
    return { recordId: profile.id, previous: profile }
  }

  if (action.kind === 'foodCreate') {
    const food: HealthFood = {
      id: newId(),
      code: newCode(),
      name: action.name,
      kcal: action.kcal,
      protein: action.protein,
      carbs: action.carbs,
      fat: action.fat,
      servingName: action.servingName,
      servingGrams: action.servingGrams,
      photo: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthFood(food)
    return { recordId: food.id }
  }

  if (action.kind === 'foodEdit') {
    const food = data.foods.find((item) => item.deletedAt === null && item.code === action.code)
    if (!food) throw new Error('这条食物已经不在了，刷新后再看一次。')
    const next: HealthFood = {
      ...food,
      ...(action.name === undefined ? {} : { name: action.name }),
      ...(action.kcal === undefined ? {} : { kcal: action.kcal }),
      ...(action.protein === undefined ? {} : { protein: action.protein }),
      ...(action.carbs === undefined ? {} : { carbs: action.carbs }),
      ...(action.fat === undefined ? {} : { fat: action.fat }),
      ...(action.servingName === undefined ? {} : { servingName: action.servingName }),
      ...(action.servingGrams === undefined ? {} : { servingGrams: action.servingGrams }),
      updatedAt: now,
    }
    await saveHealthFood(next)
    return { recordId: food.id, previous: food }
  }

  if (action.kind === 'foodDelete') {
    const food = data.foods.find((item) => item.deletedAt === null && item.code === action.code)
    if (!food) throw new Error('这条食物已经不在了，刷新后再看一次。')
    await removeHealthFood(food.id)
    return { recordId: food.id, previous: food }
  }

  if (action.kind === 'mealCreate') {
    const meal: HealthMeal = {
      id: newId(),
      name: action.name,
      items: action.items.map((item) => ({ foodId: item.foodId, grams: item.grams })),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthMeal(meal)
    return { recordId: meal.id }
  }

  if (action.kind === 'mealEdit') {
    const meal = data.meals.find((item) => item.deletedAt === null && item.id === action.mealId)
    if (!meal) throw new Error('这个套餐已经不在了，刷新后再看一次。')
    const next: HealthMeal = {
      ...meal,
      ...(action.name === undefined ? {} : { name: action.name }),
      ...(action.items === undefined
        ? {}
        : { items: action.items.map((item) => ({ foodId: item.foodId, grams: item.grams })) }),
      updatedAt: now,
    }
    await saveHealthMeal(next)
    return { recordId: meal.id, previous: meal }
  }

  if (action.kind === 'mealDelete') {
    const meal = data.meals.find((item) => item.deletedAt === null && item.id === action.mealId)
    if (!meal) throw new Error('这个套餐已经不在了，刷新后再看一次。')
    await removeHealthMeal(meal.id)
    return { recordId: meal.id, previous: meal }
  }

  if (action.kind === 'presetCreate') {
    const preset: DiaryPreset = {
      id: newId(),
      code: newCode(),
      kind: action.presetKind,
      name: action.name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveDiaryPreset(preset)
    return { recordId: preset.id }
  }

  if (action.kind === 'presetEdit') {
    const preset = data.presets.find((item) => item.deletedAt === null && item.code === action.code)
    if (!preset) throw new Error('这条预设已经不在了，刷新后再看一次。')
    const next: DiaryPreset = {
      ...preset,
      ...(action.name === undefined ? {} : { name: action.name }),
      ...(action.presetKind === undefined ? {} : { kind: action.presetKind }),
      updatedAt: now,
    }
    await saveDiaryPreset(next)
    return { recordId: preset.id, previous: preset }
  }

  if (action.kind === 'presetDelete') {
    const preset = data.presets.find((item) => item.deletedAt === null && item.code === action.code)
    if (!preset) throw new Error('这条预设已经不在了，刷新后再看一次。')
    await removeDiaryPreset(preset.id)
    return { recordId: preset.id, previous: preset }
  }

  if (action.kind === 'profileEdit') {
    const profile = await healthProfile()
    if (!profile) throw new Error('用户还没有身体档案。')
    const next: HealthProfile = {
      ...profile,
      ...(action.sex === undefined ? {} : { sex: action.sex }),
      ...(action.age === undefined ? {} : { age: action.age }),
      ...(action.heightCm === undefined ? {} : { heightCm: action.heightCm }),
      ...(action.weightKg === undefined ? {} : { weightKg: action.weightKg }),
      ...(action.activity === undefined ? {} : { activity: action.activity }),
      ...(action.tdee === undefined ? {} : { tdee: action.tdee }),
      ...(action.targetKcal === undefined ? {} : { targetKcal: action.targetKcal }),
      ...(action.proteinTarget === undefined ? {} : { proteinTarget: action.proteinTarget }),
      ...(action.idealBedtime === undefined ? {} : { idealBedtime: action.idealBedtime }),
      ...(action.idealWakeTime === undefined ? {} : { idealWakeTime: action.idealWakeTime }),
      ...(action.note === undefined ? {} : { note: action.note }),
      updatedAt: now,
    }
    await saveHealthProfile(next)
    return { recordId: profile.id, previous: profile }
  }

  if (action.kind === 'weatherEdit') {
    const previous = data.days.find((item) => item.dateKey === action.dateKey) ?? null
    await setWeather(action.dateKey, action.weather)
    return { recordId: null, previous }
  }

  if (action.kind === 'memoryEdit') {
    const previous = findMemoryByText(loadMemories(), action.text)
    if (!previous) throw new Error('这条记忆已经不在了，刷新后再看一次。')
    updateMemory(previous.id, {
      ...(action.newText === undefined ? {} : { text: action.newText }),
      ...(action.memoryKind === undefined ? {} : { kind: action.memoryKind }),
    })
    return { recordId: previous.id, previous }
  }

  if (action.kind === 'memoryDelete') {
    const previous = findMemoryByText(loadMemories(), action.text)
    if (!previous) throw new Error('这条记忆已经不在了，刷新后再看一次。')
    removeMemory(previous.id)
    return { recordId: previous.id, previous }
  }

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
          naps: [],
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

  if (action.kind === 'diaryEdit') {
    const previous = done.previous as DiaryEntry | null
    if (previous) await updateContent(previous.id, previous.content, previous.images)
    return
  }

  if (action.kind === 'stampEdit') {
    const previous = done.previous as DiaryStamp | null
    if (previous) await updateStamp(previous.id, { time: previous.time, content: previous.content })
    return
  }

  if (action.kind === 'financeEdit') {
    const previous = done.previous as FinanceEntry | null
    if (previous) await saveFinance(previous)
    return
  }

  if (action.kind === 'financeDelete') {
    if (done.recordId) await restoreFinance(done.recordId)
    return
  }

  if (action.kind === 'stampDelete') {
    if (done.recordId) await restoreStamp(done.recordId)
    return
  }

  if (action.kind === 'intakeDelete') {
    if (done.recordId) await restoreIntake(done.recordId)
    return
  }

  if (action.kind === 'sleepDelete') {
    if (done.recordId) await restoreHealthSleep(done.recordId)
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

  if (action.kind === 'diaryDelete') {
    if (done.recordId) await restoreEntry(done.recordId)
    return
  }

  if (action.kind === 'intakeEdit') {
    const previous = done.previous as HealthIntake | null
    if (previous) await saveIntake(previous)
    return
  }

  if (action.kind === 'sleepEdit') {
    const previous = done.previous as HealthSleep | null
    if (previous) await saveHealthSleep(previous)
    return
  }

  if (action.kind === 'weighDelete') {
    const previous = done.previous as HealthProfile | null
    const current = await healthProfile()
    if (!current) {
      if (previous) await saveHealthProfile(previous)
      return
    }
    const removed = previous?.weighIns.find((item) => item.dateKey === action.dateKey)
    if (!removed || current.weighIns.some((item) => item.dateKey === action.dateKey)) return
    const weighIns = [removed, ...current.weighIns].sort((a, b) => b.createdAt - a.createdAt).slice(0, 120)
    await saveHealthProfile({
      ...current,
      weighIns,
      weightKg: weighIns[0]?.weightKg ?? current.weightKg,
      weightAt: weighIns[0]?.createdAt ?? current.weightAt,
      updatedAt: Date.now(),
    })
    return
  }

  if (action.kind === 'foodCreate') {
    if (done.recordId) await removeHealthFood(done.recordId)
    return
  }

  if (action.kind === 'foodEdit') {
    const previous = done.previous as HealthFood | null
    if (previous) await saveHealthFood(previous)
    return
  }

  if (action.kind === 'foodDelete') {
    if (done.recordId) await restoreHealthFood(done.recordId)
    return
  }

  if (action.kind === 'mealCreate') {
    if (done.recordId) await removeHealthMeal(done.recordId)
    return
  }

  if (action.kind === 'mealEdit') {
    const previous = done.previous as HealthMeal | null
    if (previous) await saveHealthMeal(previous)
    return
  }

  if (action.kind === 'mealDelete') {
    if (done.recordId) await restoreHealthMeal(done.recordId)
    return
  }

  if (action.kind === 'presetCreate') {
    if (done.recordId) await removeDiaryPreset(done.recordId)
    return
  }

  if (action.kind === 'presetEdit') {
    const previous = done.previous as DiaryPreset | null
    if (previous) await saveDiaryPreset(previous)
    return
  }

  if (action.kind === 'presetDelete') {
    if (done.recordId) await restoreDiaryPreset(done.recordId)
    return
  }

  if (action.kind === 'profileEdit') {
    const previous = done.previous as HealthProfile | null
    if (previous) await saveHealthProfile(previous)
    return
  }

  if (action.kind === 'weatherEdit') {
    const previous = done.previous as DiaryDay | null
    await setWeather(action.dateKey, previous?.weather ?? '')
    return
  }

  if (action.kind === 'memoryEdit') {
    const previous = done.previous as AssistantMemory | null
    if (previous) updateMemory(previous.id, { text: previous.text, kind: previous.kind })
    return
  }

  if (action.kind === 'memoryDelete') {
    const previous = done.previous as AssistantMemory | null
    if (previous) addMemory({ text: previous.text, kind: previous.kind, source: previous.source })
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
