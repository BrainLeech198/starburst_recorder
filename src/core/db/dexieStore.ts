/**
 * `DiaryStore` 的 Dexie / IndexedDB 实现。
 *
 * 这是目前唯一碰数据库的地方。换存储时保留这个文件作为对照，
 * 再按 `store.ts` 的契约写一份新的实现即可。
 */
import { db } from './db'
import type {
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
  HealthSleep,
  HealthTraining,
  IntakeComponent,
  ScheduleItem,
} from './schema'
import type {
  DiaryEntryBrief,
  DiaryStampBrief,
  AssistantData,
  DiaryComposeData,
  FinanceEntryBrief,
  HealthFoodBrief,
  HealthMealBrief,
  DiaryStore,
  BackupData,
  BackupSections,
  ImportStats,
  SearchResults,
  DayActivity,
} from './store'
import { zeroStats } from './store'
import { briefEntry, briefFinance, briefFood, briefMeal, briefStamp } from './brief'
import { cleanTags } from './normalize'
import { searchRows } from '@/core/search/match'
import { newCode, newId } from '@/core/utils/id'
import { formatClock } from '@/core/utils/dateKey'

async function briefEntryRows(): Promise<DiaryEntryBrief[]> {
  const result: DiaryEntryBrief[] = []
  await db.diaryEntries.each((entry) => result.push(briefEntry(entry)))
  return result
}

async function briefStampRows(): Promise<DiaryStampBrief[]> {
  const result: DiaryStampBrief[] = []
  await db.diaryStamps.each((stamp) => result.push(briefStamp(stamp)))
  return result
}

async function briefFinanceRows(): Promise<FinanceEntryBrief[]> {
  const result: FinanceEntryBrief[] = []
  await db.financeEntries.each((entry) => result.push(briefFinance(entry)))
  return result
}

async function briefHealthFoodRows(includeDeleted = false): Promise<HealthFoodBrief[]> {
  const result: HealthFoodBrief[] = []
  await db.healthFoods.each((food) => {
    if (includeDeleted || food.deletedAt === null) result.push(briefFood(food))
  })
  return result
}

async function briefHealthMealRows(includeDeleted = false): Promise<HealthMealBrief[]> {
  const result: HealthMealBrief[] = []
  await db.healthMeals.each((meal) => {
    if (includeDeleted || meal.deletedAt === null) result.push(briefMeal(meal))
  })
  return result
}

async function healthFoodPhotoById(id: string): Promise<string | null> {
  const food = await db.healthFoods.get(id)
  return food?.deletedAt === null ? food.photo : null
}

async function healthMealPhotoById(id: string): Promise<string | null> {
  const meal = await db.healthMeals.get(id)
  if (!meal || meal.deletedAt !== null) return null
  if (meal.photo) return meal.photo
  for (const item of meal.items) {
    const photo = await healthFoodPhotoById(item.foodId)
    if (photo) return photo
  }
  return null
}

export const dexieStore: DiaryStore = {
  entriesOfDay(dateKey) {
    return db.diaryEntries
      .where('dateKey')
      .equals(dateKey)
      .filter((entry) => entry.deletedAt === null)
      .sortBy('createdAt')
  },

  async briefEntriesOfDay(dateKey) {
    const result: DiaryEntryBrief[] = []
    await db.diaryEntries.where('dateKey').equals(dateKey).each((entry) => {
      if (entry.deletedAt === null) result.push(briefEntry(entry))
    })
    return result.sort((a, b) => a.createdAt - b.createdAt)
  },

  entryByCode(code) {
    return db.diaryEntries.where('code').equals(code).first()
  },

  async createEntry(dateKey) {
    const now = Date.now()
    const entry: DiaryEntry = {
      id: newId(),
      code: newCode(),
      dateKey,
      createdAt: now,
      updatedAt: now,
      content: '',
      images: [],
      tags: [],
      deletedAt: null,
    }
    await db.diaryEntries.add(entry)
    return entry
  },

  async updateContent(id, content, images) {
    await db.diaryEntries.update(id, { content, images, updatedAt: Date.now() })
  },

  async setEntryTags(id, tags) {
    await db.diaryEntries.update(id, { tags: cleanTags(tags), updatedAt: Date.now() })
  },

  async removeEntry(id) {
    await db.diaryEntries.update(id, { deletedAt: Date.now() })
  },

  async removeEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreEntry(id) {
    await db.diaryEntries.update(id, { deletedAt: null })
  },

  async restoreEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async moveEntries(ids, dateKey) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
  },

  dayInfo(dateKey) {
    return db.diaryDays.get(dateKey)
  },

  async setWeather(dateKey, weather) {
    await db.diaryDays.put({ dateKey, weather, updatedAt: Date.now() })
  },

  stampsOfDay(dateKey) {
    return db.diaryStamps
      .where('dateKey')
      .equals(dateKey)
      .filter((stamp) => stamp.deletedAt === null)
      .sortBy('time')
  },

  async briefStampsOfDay(dateKey) {
    const result: DiaryStampBrief[] = []
    await db.diaryStamps.where('dateKey').equals(dateKey).each((stamp) => {
      if (stamp.deletedAt === null) result.push(briefStamp(stamp))
    })
    return result.sort((a, b) => a.time.localeCompare(b.time))
  },

  stampById(id) {
    return db.diaryStamps.get(id)
  },

  async addStamp(dateKey) {
    const now = Date.now()
    const stamp: DiaryStamp = {
      id: newId(),
      code: newCode(),
      dateKey,
      time: formatClock(now),
      content: '',
      images: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.diaryStamps.add(stamp)
    return stamp
  },

  async updateStamp(id, patch) {
    await db.diaryStamps.update(id, { ...patch, updatedAt: Date.now() })
  },

  async setStampTags(id, tags) {
    await db.diaryStamps.update(id, { tags: cleanTags(tags), updatedAt: Date.now() })
  },

  async removeStamp(id) {
    await db.diaryStamps.update(id, { deletedAt: Date.now() })
  },

  async restoreStamp(id) {
    await db.diaryStamps.update(id, { deletedAt: null })
  },

  async removeStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async moveStamps(ids, dateKey) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).modify({ dateKey, updatedAt: Date.now() })
  },

  // ─────────── 预设库 ───────────

  async diaryPresets() {
    const rows = await db.diaryPresets.filter((preset) => preset.deletedAt === null).toArray()
    return rows.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    )
  },

  async trashedDiaryPresets() {
    const rows = await db.diaryPresets.filter((preset) => preset.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async saveDiaryPreset(preset) {
    const next: DiaryPreset = { ...preset, updatedAt: Date.now() }
    await db.diaryPresets.put(next)
    return next
  },

  async removeDiaryPreset(id) {
    await db.diaryPresets.update(id, { deletedAt: Date.now() })
  },

  async removeDiaryPresets(ids) {
    if (ids.length === 0) return 0
    return db.diaryPresets.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreDiaryPreset(id) {
    await db.diaryPresets.update(id, { deletedAt: null })
  },

  async restoreDiaryPresets(ids) {
    if (ids.length === 0) return 0
    return db.diaryPresets.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async purgeDiaryPreset(id) {
    await db.diaryPresets.delete(id)
  },

  async purgeTrashedDiaryPresets() {
    await db.diaryPresets.filter((preset) => preset.deletedAt !== null).delete()
  },

  async trashedEntries() {
    const list = await db.diaryEntries
      .filter((entry) => entry.deletedAt !== null)
      .toArray()
    return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async trashedStamps() {
    const list = await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).toArray()
    return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeEntry(id) {
    await db.diaryEntries.delete(id)
  },

  async purgeStamp(id) {
    await db.diaryStamps.delete(id)
  },

  async purgeEntries(ids) {
    if (ids.length === 0) return 0
    return db.diaryEntries.where('id').anyOf(ids).delete()
  },

  async purgeStamps(ids) {
    if (ids.length === 0) return 0
    return db.diaryStamps.where('id').anyOf(ids).delete()
  },

  async purgeTrashedEntries() {
    await db.diaryEntries.filter((entry) => entry.deletedAt !== null).delete()
  },

  async purgeTrashedStamps() {
    await db.diaryStamps.filter((stamp) => stamp.deletedAt !== null).delete()
  },

  everyEntry() {
    return db.diaryEntries.toArray()
  },

  everyStamp() {
    return db.diaryStamps.toArray()
  },

  async briefEntries() {
    return briefEntryRows()
  },

  async briefStamps() {
    return briefStampRows()
  },

  async diaryComposeData(): Promise<DiaryComposeData> {
    const [entries, stamps, days, finance, intakes, sleeps] = await Promise.all([
      briefEntryRows(),
      briefStampRows(),
      db.diaryDays.toArray(),
      briefFinanceRows(),
      db.healthIntakes.toArray(),
      db.healthSleeps.toArray(),
    ])
    return { entries, stamps, days, finance, intakes, sleeps }
  },

  async assistantData(): Promise<AssistantData> {
    const [entries, stamps, days, presets, profile, foods, meals, intakes, sleeps, trainings, finance, schedules] =
      await Promise.all([
        briefEntryRows(),
        briefStampRows(),
        db.diaryDays.toArray(),
        db.diaryPresets.toArray(),
        db.healthProfile.get('me'),
        briefHealthFoodRows(true),
        briefHealthMealRows(true),
        db.healthIntakes.toArray(),
        db.healthSleeps.toArray(),
        db.healthTrainings.toArray(),
        briefFinanceRows(),
        db.schedules.toArray(),
      ])
    return {
      entries,
      stamps,
      days,
      presets,
      profile: profile ?? null,
      foods,
      meals,
      intakes,
      sleeps,
      trainings,
      finance,
      schedules,
    }
  },

  everyDay() {
    return db.diaryDays.toArray()
  },

  async totals() {
    const [
      entries,
      stamps,
      days,
      presets,
      schedules,
      profile,
      foods,
      meals,
      intakes,
      sleeps,
      trainings,
      finance,
    ] = await Promise.all([
      db.diaryEntries.filter((item) => item.deletedAt === null).count(),
      db.diaryStamps.filter((item) => item.deletedAt === null).count(),
      db.diaryDays.count(),
      db.diaryPresets.filter((item) => item.deletedAt === null).count(),
      db.schedules.filter((item) => item.deletedAt === null).count(),
      db.healthProfile.get('me'),
      db.healthFoods.filter((item) => item.deletedAt === null).count(),
      db.healthMeals.filter((item) => item.deletedAt === null).count(),
      db.healthIntakes.filter((item) => item.deletedAt === null).count(),
      db.healthSleeps.filter((item) => item.deletedAt === null).count(),
      db.healthTrainings.filter((item) => item.deletedAt === null).count(),
      db.financeEntries.filter((item) => item.deletedAt === null).count(),
    ])
    return {
      entries,
      stamps,
      days,
      presets,
      schedules,
      foods,
      meals,
      intakes,
      sleeps,
      trainings,
      weights: profile?.weighIns?.length ?? 0,
      finance,
    }
  },

  async exportAllData(): Promise<BackupData> {
    const [
      entries,
      stamps,
      days,
      presets,
      profile,
      foods,
      meals,
      intakes,
      sleeps,
      trainings,
      finance,
      schedules,
    ] = await Promise.all([
      db.diaryEntries.toArray(),
      db.diaryStamps.toArray(),
      db.diaryDays.toArray(),
      db.diaryPresets.toArray(),
      db.healthProfile.get('me'),
      db.healthFoods.toArray(),
      db.healthMeals.toArray(),
      db.healthIntakes.toArray(),
      db.healthSleeps.toArray(),
      db.healthTrainings.toArray(),
      db.financeEntries.toArray(),
      db.schedules.toArray(),
    ])
    return {
      entries,
      stamps,
      days,
      presets,
      profile: profile ?? null,
      foods,
      meals,
      intakes,
      sleeps,
      trainings,
      finance,
      schedules,
    }
  },

  async searchRecords(keyword, categoryIds): Promise<SearchResults> {
    const [
      entries,
      stamps,
      finance,
      sleeps,
      intakes,
      trainings,
      schedules,
      foods,
      meals,
      presets,
    ] = await Promise.all([
      briefEntryRows(),
      briefStampRows(),
      briefFinanceRows(),
      db.healthSleeps.toArray(),
      db.healthIntakes.toArray(),
      db.healthTrainings.toArray(),
      db.schedules.toArray(),
      briefHealthFoodRows(),
      briefHealthMealRows(),
      db.diaryPresets.toArray(),
    ])
    return searchRows(
      { entries, stamps, finance, sleeps, intakes, trainings, schedules, foods, meals, presets },
      keyword,
      categoryIds,
    )
  },

  async activityBetween(from, to): Promise<DayActivity[]> {
    const map = new Map<string, DayActivity>()
    type Field = keyof Omit<DayActivity, 'dateKey'>
    const bump = (dateKey: string, field: Field) => {
      let row = map.get(dateKey)
      if (!row) {
        row = {
          dateKey,
          entries: 0,
          stamps: 0,
          intakes: 0,
          sleeps: 0,
          trainings: 0,
          finance: 0,
          weighIns: 0,
        }
        map.set(dateKey, row)
      }
      row[field] += 1
    }

    // 一张表扫完再下一张：每行当场计数，不把带图片的记录攒进数组
    await db.diaryEntries
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'entries'))
    await db.diaryStamps
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'stamps'))
    await db.healthIntakes
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'intakes'))
    await db.healthSleeps
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'sleeps'))
    await db.healthTrainings
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'trainings'))
    await db.financeEntries
      .where('dateKey')
      .between(from, to, true, true)
      .filter((row) => row.deletedAt === null)
      .each((row) => bump(row.dateKey, 'finance'))

    // 称重历史挂在身体档案的 JSON 里，没有单独的表
    const profile = await db.healthProfile.get('me')
    for (const item of profile?.weighIns ?? []) {
      if (item.dateKey >= from && item.dateKey <= to) bump(item.dateKey, 'weighIns')
    }

    return [...map.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  },

  importSections(data): Promise<ImportStats> {
    return applySections(data)
  },
  replaceSections(data): Promise<ImportStats> {
    return applySections(data, true)
  },

  async importBackup(data): Promise<ImportStats> {
    return applySections({ diary: data })
  },

  async clearDiaryData() {
    await db.transaction(
      'rw',
      [db.diaryEntries, db.diaryDays, db.diaryStamps, db.diaryPresets, db.schedules],
      async () => {
        await Promise.all([
          db.diaryEntries.clear(),
          db.diaryDays.clear(),
          db.diaryStamps.clear(),
          db.diaryPresets.clear(),
          db.schedules.clear(),
        ])
      },
    )
  },

  async clearHealthData() {
    await db.transaction(
      'rw',
      [
        db.healthProfile,
        db.healthFoods,
        db.healthMeals,
        db.healthIntakes,
        db.healthSleeps,
        db.healthTrainings,
      ],
      async () => {
        await Promise.all([
          db.healthProfile.clear(),
          db.healthFoods.clear(),
          db.healthMeals.clear(),
          db.healthIntakes.clear(),
          db.healthSleeps.clear(),
          db.healthTrainings.clear(),
        ])
      },
    )
  },

  async clearFinanceData() {
    await db.financeEntries.clear()
  },

  async trashDiaryData() {
    const now = Date.now()
    await db.transaction(
      'rw',
      [db.diaryEntries, db.diaryStamps, db.diaryPresets, db.schedules],
      async () => {
        await Promise.all([
          db.diaryEntries.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.diaryStamps.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.diaryPresets.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.schedules.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
        ])
      },
    )
  },

  async trashHealthData() {
    const now = Date.now()
    await db.transaction(
      'rw',
      [db.healthFoods, db.healthMeals, db.healthIntakes, db.healthSleeps, db.healthTrainings],
      async () => {
        await Promise.all([
          db.healthFoods.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.healthMeals.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.healthIntakes.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.healthSleeps.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
          db.healthTrainings.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
        ])
      },
    )
  },

  async trashFinanceData() {
    const now = Date.now()
    await db.financeEntries.filter((item) => item.deletedAt === null).modify({ deletedAt: now })
  },

  // ─────────── 健康 ───────────

  healthProfile(): Promise<HealthProfile | undefined> {
    return db.healthProfile.get('me')
  },

  async saveHealthProfile(profile) {
    const next: HealthProfile = { ...profile, id: 'me', updatedAt: Date.now() }
    await db.healthProfile.put(next)
    return next
  },
  async deleteHealthProfile() {
    await db.healthProfile.delete('me')
  },

  healthFoods(): Promise<HealthFood[]> {
    return db.healthFoods
      .filter((food) => food.deletedAt === null)
      .sortBy('name')
  },

  async healthFoodBriefs(): Promise<HealthFoodBrief[]> {
    const result = await briefHealthFoodRows()
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  },

  healthFoodById(id) {
    return db.healthFoods.get(id)
  },

  async healthFoodPhoto(id) {
    return healthFoodPhotoById(id)
  },

  async saveHealthFood(food) {
    const next: HealthFood = { ...food, tags: cleanTags(food.tags), updatedAt: Date.now() }
    await db.healthFoods.put(next)
    return next
  },

  async mergeHealthFoods(sourceId, targetId) {
    if (sourceId === targetId) return { intakes: 0, meals: 0 }
    return db.transaction('rw', [db.healthFoods, db.healthMeals, db.healthIntakes], async () => {
      const [source, target] = await Promise.all([
        db.healthFoods.get(sourceId),
        db.healthFoods.get(targetId),
      ])
      if (!source || !target) throw new Error('merge: food not found')
      const now = Date.now()

      // 套餐只存组合：把索引换掉就行，两份同时在场时保留两行
      const meals = await db.healthMeals
        .filter((meal) => meal.items.some((item) => item.foodId === sourceId))
        .toArray()
      for (const meal of meals) {
        await db.healthMeals.put({
          ...meal,
          items: meal.items.map((item) =>
            item.foodId === sourceId ? { ...item, foodId: targetId } : item,
          ),
          updatedAt: now,
        })
      }

      // 摄入是快照：换引用，并按 target 当前每 100g 的营养重算
      const intakes = await db.healthIntakes
        .filter(
          (row) =>
            row.foodId === sourceId ||
            (row.components ?? []).some((part) => part.foodId === sourceId),
        )
        .toArray()
      for (const row of intakes) {
        const parts = row.components ?? []
        let next: HealthIntake = row
        if (parts.length > 0) {
          const nextParts = parts.map((part) =>
            part.foodId === sourceId ? recalcIntakePart(part, target) : part,
          )
          next = { ...next, components: nextParts, ...sumParts(nextParts), updatedAt: now }
        }
        if (row.foodId === sourceId) {
          next = parts.length > 0
            ? { ...next, foodId: targetId, updatedAt: now }
            : {
                ...next,
                foodId: targetId,
                name: target.name,
                ...macrosFor(target, row.grams),
                updatedAt: now,
              }
        }
        await db.healthIntakes.put(next)
      }

      await db.healthFoods.update(sourceId, { deletedAt: now, updatedAt: now })
      return { intakes: intakes.length, meals: meals.length }
    })
  },

  async removeHealthFood(id) {
    await db.healthFoods.update(id, { deletedAt: Date.now() })
  },

  async removeHealthFoods(ids) {
    if (ids.length === 0) return 0
    return db.healthFoods.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async trashedHealthFoods(): Promise<HealthFood[]> {
    const rows = await db.healthFoods.filter((food) => food.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async restoreHealthFood(id) {
    await db.healthFoods.update(id, { deletedAt: null })
  },

  async restoreHealthFoods(ids) {
    if (ids.length === 0) return 0
    return db.healthFoods.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async purgeHealthFood(id) {
    await db.healthFoods.delete(id)
  },

  async purgeTrashedHealthFoods() {
    await db.healthFoods.filter((food) => food.deletedAt !== null).delete()
  },

  healthMeals(): Promise<HealthMeal[]> {
    return db.healthMeals
      .filter((meal) => meal.deletedAt === null)
      .sortBy('name')
  },

  async healthMealBriefs(): Promise<HealthMealBrief[]> {
    const result = await briefHealthMealRows()
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  },

  healthMealById(id) {
    return db.healthMeals.get(id)
  },

  async healthMealPhoto(id) {
    return healthMealPhotoById(id)
  },

  async saveHealthMeal(meal) {
    const next: HealthMeal = { ...meal, updatedAt: Date.now() }
    await db.healthMeals.put(next)
    return next
  },

  async removeHealthMeal(id) {
    await db.healthMeals.update(id, { deletedAt: Date.now() })
  },

  async removeHealthMeals(ids) {
    if (ids.length === 0) return 0
    return db.healthMeals.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async trashedHealthMeals(): Promise<HealthMeal[]> {
    const rows = await db.healthMeals.filter((meal) => meal.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async restoreHealthMeal(id) {
    await db.healthMeals.update(id, { deletedAt: null })
  },

  async restoreHealthMeals(ids) {
    if (ids.length === 0) return 0
    return db.healthMeals.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async purgeHealthMeal(id) {
    await db.healthMeals.delete(id)
  },

  async purgeTrashedHealthMeals() {
    await db.healthMeals.filter((meal) => meal.deletedAt !== null).delete()
  },

  intakesOfDay(dateKey): Promise<HealthIntake[]> {
    return db.healthIntakes
      .where('dateKey')
      .equals(dateKey)
      .filter((intake) => intake.deletedAt === null)
      .sortBy('time')
  },

  async intakesBetween(from: string, to: string): Promise<HealthIntake[]> {
    const rows = await db.healthIntakes
      .where('dateKey')
      .between(from, to, true, true)
      .filter((intake) => intake.deletedAt === null)
      .toArray()
    return rows.sort(
      (a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time),
    )
  },

  async intakeDays(): Promise<string[]> {
    const rows = await db.healthIntakes.filter((intake) => intake.deletedAt === null).toArray()
    return [...new Set(rows.map((intake) => intake.dateKey))]
  },

  async addIntake(intake) {
    await db.healthIntakes.add(intake)
    return intake
  },

  async saveIntake(intake) {
    const next: HealthIntake = { ...intake, updatedAt: Date.now() }
    await db.healthIntakes.put(next)
    return next
  },

  async removeIntake(id) {
    await db.healthIntakes.update(id, { deletedAt: Date.now() })
  },

  async removeIntakes(ids) {
    if (ids.length === 0) return 0
    return db.healthIntakes.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreIntake(id) {
    await db.healthIntakes.update(id, { deletedAt: null })
  },

  async restoreIntakes(ids) {
    if (ids.length === 0) return 0
    return db.healthIntakes.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async trashedIntakes(): Promise<HealthIntake[]> {
    const rows = await db.healthIntakes.filter((intake) => intake.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeIntake(id) {
    await db.healthIntakes.delete(id)
  },

  async purgeTrashedIntakes() {
    await db.healthIntakes.filter((intake) => intake.deletedAt !== null).delete()
  },

  sleepOfDay(dateKey): Promise<HealthSleep | undefined> {
    return db.healthSleeps
      .where('dateKey')
      .equals(dateKey)
      .filter((sleep) => sleep.deletedAt === null)
      .first()
  },

  async sleepsBetween(from: string, to: string): Promise<HealthSleep[]> {
    const rows = await db.healthSleeps
      .where('dateKey')
      .between(from, to, true, true)
      .filter((sleep) => sleep.deletedAt === null)
      .toArray()
    return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  },

  async sleepDays(): Promise<string[]> {
    const rows = await db.healthSleeps.filter((sleep) => sleep.deletedAt === null).toArray()
    return [...new Set(rows.map((sleep) => sleep.dateKey))]
  },

  async saveHealthSleep(sleep) {
    const next: HealthSleep = { ...sleep, updatedAt: Date.now() }
    await db.healthSleeps.put(next)
    return next
  },

  async removeHealthSleep(id) {
    await db.healthSleeps.update(id, { deletedAt: Date.now() })
  },

  async restoreHealthSleep(id) {
    await db.healthSleeps.update(id, { deletedAt: null })
  },

  async trashedHealthSleeps(): Promise<HealthSleep[]> {
    const rows = await db.healthSleeps.filter((sleep) => sleep.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeHealthSleep(id) {
    await db.healthSleeps.delete(id)
  },

  async purgeTrashedHealthSleeps() {
    await db.healthSleeps.filter((sleep) => sleep.deletedAt !== null).delete()
  },

  // ─────────── 训练 ───────────

  async trainingOfDay(dateKey): Promise<HealthTraining[]> {
    const rows = await db.healthTrainings
      .where('dateKey')
      .equals(dateKey)
      .filter((training) => training.deletedAt === null)
      .toArray()
    return rows.sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
  },

  async trainingsBetween(from: string, to: string): Promise<HealthTraining[]> {
    const rows = await db.healthTrainings
      .where('dateKey')
      .between(from, to, true, true)
      .filter((training) => training.deletedAt === null)
      .toArray()
    return rows.sort(
      (a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time),
    )
  },

  async trainingDays(): Promise<string[]> {
    const rows = await db.healthTrainings
      .filter((training) => training.deletedAt === null)
      .toArray()
    return [...new Set(rows.map((training) => training.dateKey))]
  },

  async latestTraining(): Promise<HealthTraining | undefined> {
    const rows = await db.healthTrainings
      .filter((training) => training.deletedAt === null)
      .toArray()
    return rows.sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time),
    )[0]
  },

  async saveHealthTraining(training) {
    const next: HealthTraining = { ...training, updatedAt: Date.now() }
    await db.healthTrainings.put(next)
    return next
  },

  async removeHealthTraining(id) {
    await db.healthTrainings.update(id, { deletedAt: Date.now() })
  },

  async restoreHealthTraining(id) {
    await db.healthTrainings.update(id, { deletedAt: null })
  },

  async trashedHealthTrainings(): Promise<HealthTraining[]> {
    const rows = await db.healthTrainings
      .filter((training) => training.deletedAt !== null)
      .toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeHealthTraining(id) {
    await db.healthTrainings.delete(id)
  },

  async purgeTrashedHealthTrainings() {
    await db.healthTrainings.filter((training) => training.deletedAt !== null).delete()
  },

  async financeOfMonth(monthKey: string): Promise<FinanceEntry[]> {
    const rows = await db.financeEntries
      .where('dateKey')
      .startsWith(monthKey)
      .filter((entry) => entry.deletedAt === null)
      .toArray()
    return rows.sort((a, b) =>
      a.dateKey === b.dateKey
        ? b.createdAt - a.createdAt
        : b.dateKey.localeCompare(a.dateKey),
    )
  },

  async financeBriefsOfMonth(monthKey: string): Promise<FinanceEntryBrief[]> {
    const rows: FinanceEntryBrief[] = []
    await db.financeEntries
      .where('dateKey')
      .startsWith(monthKey)
      .each((entry) => {
        if (entry.deletedAt === null) rows.push(briefFinance(entry))
      })
    return rows.sort((a, b) =>
      a.dateKey === b.dateKey
        ? b.createdAt - a.createdAt
        : b.dateKey.localeCompare(a.dateKey),
    )
  },

  financeById(id) {
    return db.financeEntries.get(id)
  },

  async financePhoto(id) {
    const entry = await db.financeEntries.get(id)
    return entry?.deletedAt === null ? entry.photo : null
  },

  async financeDays(): Promise<string[]> {
    const rows = await db.financeEntries.filter((entry) => entry.deletedAt === null).toArray()
    return [...new Set(rows.map((entry) => entry.dateKey))]
  },

  async addFinance(entry) {
    await db.financeEntries.add(entry)
    return entry
  },

  async saveFinance(entry) {
    const next: FinanceEntry = { ...entry, updatedAt: Date.now() }
    await db.financeEntries.put(next)
    return next
  },

  async removeFinance(id) {
    await db.financeEntries.update(id, { deletedAt: Date.now() })
  },

  async removeFinances(ids) {
    if (ids.length === 0) return 0
    return db.financeEntries.where('id').anyOf(ids).modify({ deletedAt: Date.now() })
  },

  async restoreFinance(id) {
    await db.financeEntries.update(id, { deletedAt: null })
  },

  async restoreFinances(ids) {
    if (ids.length === 0) return 0
    return db.financeEntries.where('id').anyOf(ids).modify({ deletedAt: null })
  },

  async trashedFinance(): Promise<FinanceEntry[]> {
    const rows = await db.financeEntries
      .filter((entry) => entry.deletedAt !== null)
      .toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async purgeFinance(id) {
    await db.financeEntries.delete(id)
  },

  async purgeTrashedFinance() {
    await db.financeEntries.filter((entry) => entry.deletedAt !== null).delete()
  },

  // ─────────── 日程 / 定期任务 ───────────

  async schedules(): Promise<ScheduleItem[]> {
    const rows = await db.schedules.filter((item) => item.deletedAt === null).toArray()
    // 和 SQLite 版本同一口径：起始日期、时刻、创建时间都参与排序
    return rows.sort(
      (a, b) =>
        a.dateKey.localeCompare(b.dateKey) ||
        (a.time || '').localeCompare(b.time || '') ||
        a.createdAt - b.createdAt,
    )
  },

  async trashedSchedules(): Promise<ScheduleItem[]> {
    const rows = await db.schedules.filter((item) => item.deletedAt !== null).toArray()
    return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  },

  async saveSchedule(item) {
    const next: ScheduleItem = { ...item, updatedAt: Date.now() }
    await db.schedules.put(next)
    return next
  },

  async removeSchedule(id) {
    await db.schedules.update(id, { deletedAt: Date.now() })
  },

  async restoreSchedule(id) {
    await db.schedules.update(id, { deletedAt: null })
  },

  async purgeSchedule(id) {
    await db.schedules.delete(id)
  },

  async purgeTrashedSchedules() {
    await db.schedules.filter((item) => item.deletedAt !== null).delete()
  },
}

/**
 * 合并食物时按克数换算营养，规则和 `healthMath.foodMacros` 一致；
 * 存储层不反向依赖功能模块，所以在这里保留一份最小实现。
 */
function macrosFor(
  food: Pick<HealthFood, 'kcal' | 'protein' | 'carbs' | 'fat'>,
  grams: number,
) {
  const ratio = Math.max(0, grams) / 100
  const round1 = (value: number) => Math.round(value * 10) / 10
  return {
    kcal: Math.round(food.kcal * ratio),
    protein: round1(food.protein * ratio),
    carbs: round1(food.carbs * ratio),
    fat: round1(food.fat * ratio),
  }
}

function recalcIntakePart(part: IntakeComponent, target: HealthFood): IntakeComponent {
  return {
    ...part,
    foodId: target.id,
    name: target.name,
    ...macrosFor(target, part.grams),
  }
}

function sumParts(parts: Pick<IntakeComponent, 'kcal' | 'protein' | 'carbs' | 'fat'>[]) {
  const round1 = (value: number) => Math.round(value * 10) / 10
  return parts.reduce(
    (total, part) => ({
      kcal: total.kcal + part.kcal,
      protein: round1(total.protein + part.protein),
      carbs: round1(total.carbs + part.carbs),
      fat: round1(total.fat + part.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * 分块导入的实际实现：所有块放在一个事务里，要么全进要么全不进。
 * 覆盖数按「导入前这个 id / 这一天在不在库里」算，和 SQLite 那边保持一致。
 * replace 为 true 时先清空本次涉及的块，再按备份完整恢复（快照替换）。
 */
async function applySections(data: BackupSections, replace = false): Promise<ImportStats> {
  const stats = zeroStats()
  const entries = data.diary?.entries ?? []
  const stamps = data.diary?.stamps ?? []
  const days = data.diary?.days ?? []
  const presets = data.diary?.presets ?? []
  const schedules = data.schedule?.items ?? data.diary?.schedules ?? []
  const hasSchedules = data.schedule !== undefined || data.diary?.schedules !== undefined
  const health = data.health
  const foods = health?.foods ?? []
  const meals = health?.meals ?? []
  const intakes = health?.intakes ?? []
  const sleeps = health?.sleeps ?? []
  const trainings = data.training?.entries ?? health?.trainings ?? []
  const hasTrainings = data.training !== undefined || health?.trainings !== undefined
  const finance = data.finance?.entries ?? []

  // 替换模式下这些表马上会被清空，覆盖数没有意义，直接不查
  const old = replace
    ? null
    : await Promise.all([
        db.diaryEntries.bulkGet(entries.map((item) => item.id)),
        db.diaryStamps.bulkGet(stamps.map((item) => item.id)),
        db.diaryDays.bulkGet(days.map((item) => item.dateKey)),
        db.healthFoods.bulkGet(foods.map((item) => item.id)),
        db.healthMeals.bulkGet(meals.map((item) => item.id)),
        db.healthIntakes.bulkGet(intakes.map((item) => item.id)),
        db.financeEntries.bulkGet(finance.map((item) => item.id)),
        health?.profile ? db.healthProfile.get('me') : Promise.resolve(undefined),
        db.diaryPresets.bulkGet(presets.map((item) => item.id)),
        db.healthSleeps.bulkGet(sleeps.map((item) => item.id)),
        db.healthTrainings.bulkGet(trainings.map((item) => item.id)),
        db.schedules.bulkGet(schedules.map((item) => item.id)),
      ])

  await db.transaction(
    'rw',
    [
      db.diaryEntries,
      db.diaryStamps,
      db.diaryDays,
      db.healthProfile,
      db.healthFoods,
      db.healthMeals,
      db.healthIntakes,
      db.healthSleeps,
      db.healthTrainings,
      db.financeEntries,
      db.diaryPresets,
      db.schedules,
    ],
    async () => {
      if (replace) {
        if (data.diary) {
          await Promise.all([
            db.diaryEntries.clear(),
            db.diaryStamps.clear(),
            db.diaryDays.clear(),
            db.diaryPresets.clear(),
          ])
        }
        if (hasSchedules) await db.schedules.clear()
        if (health) {
          await Promise.all([
            db.healthProfile.clear(),
            db.healthFoods.clear(),
            db.healthMeals.clear(),
            db.healthIntakes.clear(),
            db.healthSleeps.clear(),
          ])
        }
        if (hasTrainings) await db.healthTrainings.clear()
        if (data.finance) await db.financeEntries.clear()
      }
      if (data.diary) {
        await db.diaryEntries.bulkPut(entries)
        await db.diaryStamps.bulkPut(stamps)
        await db.diaryDays.bulkPut(days)
        await db.diaryPresets.bulkPut(presets)
      }
      if (hasSchedules) await db.schedules.bulkPut(schedules)
      if (health) {
        if (health.profile) await db.healthProfile.put(health.profile)
        await db.healthFoods.bulkPut(foods)
        await db.healthMeals.bulkPut(meals)
        await db.healthIntakes.bulkPut(intakes)
        await db.healthSleeps.bulkPut(sleeps)
      }
      if (hasTrainings) await db.healthTrainings.bulkPut(trainings)
      if (data.finance) await db.financeEntries.bulkPut(finance)
    },
  )

  const howMany = (list: unknown[] | undefined) => (list ?? []).filter(Boolean).length
  stats.entries = { total: entries.length, overwritten: howMany(old?.[0]) }
  stats.stamps = { total: stamps.length, overwritten: howMany(old?.[1]) }
  stats.days = { total: days.length, overwritten: howMany(old?.[2]) }
  stats.presets = { total: presets.length, overwritten: howMany(old?.[8]) }
  stats.profile = {
    total: health?.profile ? 1 : 0,
    overwritten: old?.[7] ? 1 : 0,
  }
  stats.foods = { total: foods.length, overwritten: howMany(old?.[3]) }
  stats.meals = { total: meals.length, overwritten: howMany(old?.[4]) }
  stats.intakes = { total: intakes.length, overwritten: howMany(old?.[5]) }
  stats.sleeps = { total: sleeps.length, overwritten: howMany(old?.[9]) }
  stats.trainings = { total: trainings.length, overwritten: howMany(old?.[10]) }
  stats.finance = { total: finance.length, overwritten: howMany(old?.[6]) }
  stats.schedules = { total: schedules.length, overwritten: howMany(old?.[11]) }
  return stats
}
