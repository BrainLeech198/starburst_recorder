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
import type { DiaryStore, BackupData, BackupSections, ImportStats, SearchResults, DayActivity } from './store'
import { zeroStats } from './store'
import { cleanTags } from './normalize'
import { newCode, newId } from '@/core/utils/id'
import { formatClock } from '@/core/utils/dateKey'

export const dexieStore: DiaryStore = {
  entriesOfDay(dateKey) {
    return db.diaryEntries
      .where('dateKey')
      .equals(dateKey)
      .filter((entry) => entry.deletedAt === null)
      .sortBy('createdAt')
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

  everyDay() {
    return db.diaryDays.toArray()
  },

  async totals() {
    const [entries, stamps, foods, meals, intakes] = await Promise.all([
      db.diaryEntries.filter((item) => item.deletedAt === null).count(),
      db.diaryStamps.filter((item) => item.deletedAt === null).count(),
      db.healthFoods.filter((item) => item.deletedAt === null).count(),
      db.healthMeals.filter((item) => item.deletedAt === null).count(),
      db.healthIntakes.filter((item) => item.deletedAt === null).count(),
    ])
    return { entries, stamps, foods, meals, intakes }
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

  async searchRecords(keyword): Promise<SearchResults> {
    const [entries, stamps, finance, sleeps] = await Promise.all([
      db.diaryEntries.filter((item) => item.deletedAt === null).toArray(),
      db.diaryStamps.filter((item) => item.deletedAt === null).toArray(),
      db.financeEntries.filter((item) => item.deletedAt === null).toArray(),
      db.healthSleeps.filter((item) => item.deletedAt === null).toArray(),
    ])
    const tags = collectTags([
      ...entries.map((item) => item.tags),
      ...stamps.map((item) => item.tags),
    ])
    const raw = keyword.trim()
    if (raw === '') return { entries: [], stamps: [], finance: [], sleeps: [], tags }
    const needle = raw.toLowerCase()
    const byTag = raw.startsWith('#')
    const tagNeedle = byTag ? needle.slice(1) : needle
    const hit = (texts: string[], rowTags: string[]) => {
      if (byTag) return rowTags.some((tag) => tag.toLowerCase().includes(tagNeedle))
      return (
        texts.some((value) => value.toLowerCase().includes(needle)) ||
        rowTags.some((tag) => tag.toLowerCase().includes(needle))
      )
    }
    return {
      entries: entries
        .filter((item) => hit([item.content], item.tags))
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.createdAt - a.createdAt),
      stamps: stamps
        .filter((item) => hit([item.content], item.tags))
        .sort(
          (a, b) =>
            b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time) || b.createdAt - a.createdAt,
        ),
      finance: finance
        .filter((item) => hit([item.name, item.note, item.category], []))
        .sort(
          (a, b) =>
            b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time) || b.createdAt - a.createdAt,
        ),
      sleeps: sleeps
        .filter((item) => hit([item.note], []))
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
      tags,
    }
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
      [db.diaryEntries, db.diaryDays, db.diaryStamps, db.diaryPresets],
      async () => {
        await Promise.all([
          db.diaryEntries.clear(),
          db.diaryDays.clear(),
          db.diaryStamps.clear(),
          db.diaryPresets.clear(),
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
    await db.transaction('rw', [db.diaryEntries, db.diaryStamps, db.diaryPresets], async () => {
      await Promise.all([
        db.diaryEntries.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
        db.diaryStamps.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
        db.diaryPresets.filter((item) => item.deletedAt === null).modify({ deletedAt: now }),
      ])
    })
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

  healthFoods(): Promise<HealthFood[]> {
    return db.healthFoods
      .filter((food) => food.deletedAt === null)
      .sortBy('name')
  },

  async saveHealthFood(food) {
    const next: HealthFood = { ...food, updatedAt: Date.now() }
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

  async restoreFinance(id) {
    await db.financeEntries.update(id, { deletedAt: null })
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
 * 汇总库里用到的标签：按出现次数倒序，同次数按名称排。
 * 只做展示用，不单独建标签表——标签跟着记录走，删记录就自然消失。
 */
function collectTags(lists: string[][]): string[] {
  const counts = new Map<string, number>()
  for (const tags of lists) {
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .map(([tag]) => tag)
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
  const schedules = data.diary?.schedules ?? []
  const health = data.health
  const foods = health?.foods ?? []
  const meals = health?.meals ?? []
  const intakes = health?.intakes ?? []
  const sleeps = health?.sleeps ?? []
  const trainings = health?.trainings ?? []
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
            db.schedules.clear(),
          ])
        }
        if (health) {
          await Promise.all([
            db.healthProfile.clear(),
            db.healthFoods.clear(),
            db.healthMeals.clear(),
            db.healthIntakes.clear(),
            db.healthSleeps.clear(),
            db.healthTrainings.clear(),
          ])
        }
        if (data.finance) await db.financeEntries.clear()
      }
      if (data.diary) {
        await db.diaryEntries.bulkPut(entries)
        await db.diaryStamps.bulkPut(stamps)
        await db.diaryDays.bulkPut(days)
        await db.diaryPresets.bulkPut(presets)
        await db.schedules.bulkPut(schedules)
      }
      if (health) {
        if (health.profile) await db.healthProfile.put(health.profile)
        await db.healthFoods.bulkPut(foods)
        await db.healthMeals.bulkPut(meals)
        await db.healthIntakes.bulkPut(intakes)
        await db.healthSleeps.bulkPut(sleeps)
        await db.healthTrainings.bulkPut(trainings)
      }
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
