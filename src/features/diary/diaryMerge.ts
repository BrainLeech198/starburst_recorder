/**
 * 导入备份时的冲突判定。
 *
 * 同一 id / 同一天在两边都存在、但内容不一样，就算一处冲突——交给用户自己选留哪边，
 * 而不是偷偷用某一边覆盖另一边。以前是「备份无条件覆盖」，结果是本地刚写的日记
 * 会被一份上个月的备份盖掉，而且导入后才发现，找不回来。
 *
 * 这里只做纯计算，不碰数据库：输入是「备份里的数据」和「当前库里的数据」，
 * 输出是一串冲突描述 + 一个按用户选择剔除冲突项的函数。这样能单独测。
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
  HealthSleep,
} from '@/core/db/schema'
import type { BackupPayload } from './diaryBackup'

export type ConflictKind =
  | 'entry'
  | 'stamp'
  | 'day'
  | 'preset'
  | 'food'
  | 'meal'
  | 'intake'
  | 'sleep'
  | 'profile'

export interface MergeConflict {
  kind: ConflictKind
  /** 记录的主键：日记/随记是 id，某天是 dateKey */
  key: string
  /** 弹窗里一行显示的标题，例如「2026-10-20 · 08:30」 */
  label: string
  /** 本地这边的内容摘要，列表里用 */
  localText: string
  /** 备份这边的内容摘要，列表里用 */
  incomingText: string
  /** 完整原文：「看全文」层要拿它对照，摘要截过没法判断 */
  localBody: string
  incomingBody: string
  /** 这条在各自那边是不是躺在回收站里，摘要为空时得说清楚是删了还是本来没写 */
  localDeleted: boolean
  incomingDeleted: boolean
  localAt: number
  incomingAt: number
}

/** 冲突项的唯一键：三张表可能各自有同名的 key，得带上类型 */
export function conflictKey(conflict: Pick<MergeConflict, 'kind' | 'key'>) {
  return `${conflict.kind}:${conflict.key}`
}

const SNIPPET_MAX = 48

function snippet(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return ''
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX)}…` : flat
}

/** 删掉的条目也算不同：一件事「在回收站」和「没删」不能当成同一条 */
function tombstone(value: number | null) {
  return value === null || value === undefined ? 'alive' : 'gone'
}

/** 软删除标记：有值就是在回收站里 */
function isDeleted(value: number | null) {
  return value !== null && value !== undefined
}

/** 图片只比 id 序列：dataURL 动辄几百 KB，逐字节比没必要，id 唯一就够 */
function imagesKey(images: DiaryEntry['images']) {
  return (images ?? []).map((item) => item.id).join(',')
}

/**
 * 有图 / 没图、图不一样，都算两边不一样。
 * 只比正文的话，备份里那张照片会被当成「内容相同」悄悄盖掉。
 */
function imagesDiffer(local: DiaryEntry['images'], incoming: DiaryEntry['images']) {
  return imagesKey(local) !== imagesKey(incoming)
}

/** 冲突行补一句图片数：正文一样时，差别就只剩在图上 */
function withImageCount(text: string, images: DiaryEntry['images']) {
  const badge = `🖼 ${images.length}`
  return text === '' ? badge : `${text} · ${badge}`
}

function entryDiffers(local: DiaryEntry, incoming: DiaryEntry) {
  return (
    local.content !== incoming.content ||
    local.dateKey !== incoming.dateKey ||
    imagesDiffer(local.images, incoming.images) ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function stampDiffers(local: DiaryStamp, incoming: DiaryStamp) {
  return (
    local.content !== incoming.content ||
    local.time !== incoming.time ||
    local.dateKey !== incoming.dateKey ||
    imagesDiffer(local.images, incoming.images) ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function dayDiffers(local: DiaryDay, incoming: DiaryDay) {
  return local.weather !== incoming.weather
}

function presetDiffers(local: DiaryPreset, incoming: DiaryPreset) {
  return (
    local.name !== incoming.name ||
    local.kind !== incoming.kind ||
    local.code !== incoming.code ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function presetSummary(preset: DiaryPreset) {
  return `${preset.kind === 'place' ? '📍' : '👤'} ${preset.name} · ${preset.code}`
}

/**
 * 找出所有冲突。内容完全一样的条目不算冲突——导入它本来也不改变任何东西。
 * 只在本地存在／只在备份存在的条目也都不算，那些是「纯新增」或「不受影响」。
 */
export function findConflicts(incoming: BackupPayload, local: BackupPayload): MergeConflict[] {
  const conflicts: MergeConflict[] = []

  const localEntries = new Map(local.entries.map((item) => [item.id, item]))
  for (const item of incoming.entries) {
    const mine = localEntries.get(item.id)
    if (!mine || !entryDiffers(mine, item)) continue
    const imageDiff = imagesDiffer(mine.images, item.images)
    conflicts.push({
      kind: 'entry',
      key: item.id,
      label: item.dateKey,
      localText: imageDiff ? withImageCount(snippet(mine.content), mine.images) : snippet(mine.content),
      incomingText: imageDiff ? withImageCount(snippet(item.content), item.images) : snippet(item.content),
      localBody: imageDiff ? withImageCount(mine.content, mine.images) : mine.content,
      incomingBody: imageDiff ? withImageCount(item.content, item.images) : item.content,
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localStamps = new Map(local.stamps.map((item) => [item.id, item]))
  for (const item of incoming.stamps) {
    const mine = localStamps.get(item.id)
    if (!mine || !stampDiffers(mine, item)) continue
    const imageDiff = imagesDiffer(mine.images, item.images)
    conflicts.push({
      kind: 'stamp',
      key: item.id,
      label: `${item.dateKey} · ${item.time}`,
      localText: imageDiff ? withImageCount(snippet(mine.content), mine.images) : snippet(mine.content),
      incomingText: imageDiff ? withImageCount(snippet(item.content), item.images) : snippet(item.content),
      localBody: imageDiff ? withImageCount(mine.content, mine.images) : mine.content,
      incomingBody: imageDiff ? withImageCount(item.content, item.images) : item.content,
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localDays = new Map(local.days.map((item) => [item.dateKey, item]))
  for (const item of incoming.days) {
    const mine = localDays.get(item.dateKey)
    if (!mine || !dayDiffers(mine, item)) continue
    conflicts.push({
      kind: 'day',
      key: item.dateKey,
      label: item.dateKey,
      localText: mine.weather ?? '',
      incomingText: item.weather ?? '',
      localBody: mine.weather ?? '',
      incomingBody: item.weather ?? '',
      // 天气是挂在某天上的标记，没有回收站概念
      localDeleted: false,
      incomingDeleted: false,
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localPresets = new Map(local.presets.map((item) => [item.id, item]))
  for (const item of incoming.presets) {
    const mine = localPresets.get(item.id)
    if (!mine || !presetDiffers(mine, item)) continue
    conflicts.push({
      kind: 'preset',
      key: item.id,
      label: item.name,
      localText: snippet(presetSummary(mine)),
      incomingText: snippet(presetSummary(item)),
      localBody: presetSummary(mine),
      incomingBody: presetSummary(item),
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  return conflicts
}

/**
 * 按用户的选择把「保留本地」的那些从备份里剔掉，剩下的才会真正写进库。
 * 没被选进 keepLocal 的冲突项就按备份的版本写——那是用户明确选的。
 */
export function pickIncoming(
  incoming: BackupPayload,
  keepLocal: Set<string>,
): BackupPayload {
  if (keepLocal.size === 0) return incoming
  return {
    ...incoming,
    entries: incoming.entries.filter((item) => !keepLocal.has(conflictKey({ kind: 'entry', key: item.id }))),
    stamps: incoming.stamps.filter((item) => !keepLocal.has(conflictKey({ kind: 'stamp', key: item.id }))),
    days: incoming.days.filter((item) => !keepLocal.has(conflictKey({ kind: 'day', key: item.dateKey }))),
    presets: incoming.presets.filter(
      (item) => !keepLocal.has(conflictKey({ kind: 'preset', key: item.id })),
    ),
  }
}

export interface HealthPart {
  profile: HealthProfile | null
  foods: HealthFood[]
  meals: HealthMeal[]
  intakes: HealthIntake[]
  sleeps: HealthSleep[]
}

function foodSummary(food: HealthFood) {
  const parts = [
    food.name,
    `${Math.round(food.kcal)} kcal/100g`,
    `P ${food.protein} / C ${food.carbs} / F ${food.fat}`,
  ]
  if (food.servingName && food.servingGrams) {
    parts.push(`${food.servingName} ${food.servingGrams} g`)
  }
  return parts.join(' · ')
}

function mealSummary(meal: HealthMeal) {
  const grams = meal.items.reduce((sum, item) => sum + item.grams, 0)
  return `${meal.name} · ${meal.items.length} items · ${Math.round(grams)} g`
}

function sleepSummary(sleep: HealthSleep) {
  const parts = [sleep.dateKey + ' ' + sleep.bedtime + '\u2192' + sleep.wakeTime]
  if (sleep.quality !== null) parts.push('q' + sleep.quality)
  // 夜醒也算这一夜的内容：次数和累计分钟都要在冲突对比里看得到
  if (sleep.wakeCount !== null && sleep.wakeCount !== undefined) {
    parts.push('wake ' + sleep.wakeCount)
  }
  if (sleep.wakeMinutes !== null && sleep.wakeMinutes !== undefined) {
    parts.push('wake ' + sleep.wakeMinutes + 'min')
  }
  if (sleep.note !== '') parts.push(sleep.note)
  return parts.join(' \u00b7 ')
}

function sleepDiffers(local: HealthSleep, incoming: HealthSleep) {
  return (
    local.dateKey !== incoming.dateKey ||
    local.bedtime !== incoming.bedtime ||
    local.wakeTime !== incoming.wakeTime ||
    (local.quality ?? null) !== (incoming.quality ?? null) ||
    (local.wakeCount ?? null) !== (incoming.wakeCount ?? null) ||
    (local.wakeMinutes ?? null) !== (incoming.wakeMinutes ?? null) ||
    local.note !== incoming.note ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function intakeSummary(intake: HealthIntake) {
  const parts = [
    `${intake.dateKey} ${intake.time}`,
    intake.name,
    `${intake.grams} g`,
    `${Math.round(intake.kcal)} kcal`,
    `P ${intake.protein} / C ${intake.carbs} / F ${intake.fat}`,
  ]
  if (intake.components && intake.components.length > 0) {
    parts.push(`${intake.components.length} parts`)
  }
  return parts.join(' · ')
}

function profileSummary(profile: HealthProfile) {
  const weighIns = profile.weighIns ?? []
  const latest = weighIns[0]
  return [
    profile.sex,
    `${profile.age}y`,
    `${profile.heightCm}cm`,
    `${profile.weightKg}kg`,
    `TDEE ${profile.tdee ?? '—'}`,
    `target ${profile.targetKcal ?? '—'}`,
    `protein ${profile.proteinTarget ?? '—'}g`,
    `weigh-ins ${weighIns.length}${latest ? ` (${latest.weightKg}kg @${latest.dateKey})` : ''}`,
    `ideal ${profile.idealBedtime}→${profile.idealWakeTime}`,
    `weigh-day ${profile.weighDay ?? '—'} @${profile.weighTime}`,
  ].join(' · ')
}

/** 称重历史只比「日期 + 体重」：createdAt/updatedAt 是导入时重写的，拿来比会凭空造冲突 */
function weighInsKey(weighIns: HealthProfile['weighIns']) {
  return (weighIns ?? []).map((item) => `${item.dateKey}:${item.weightKg}`).join(',')
}

/** 套餐只看组成；两份组成完全一样就不算冲突 */
function itemsKey(items: HealthMeal['items']) {
  return JSON.stringify(items ?? [])
}

function componentsKey(components: HealthIntake['components']) {
  return JSON.stringify(components ?? null)
}

function foodDiffers(local: HealthFood, incoming: HealthFood) {
  return (
    local.name !== incoming.name ||
    local.kcal !== incoming.kcal ||
    local.protein !== incoming.protein ||
    local.carbs !== incoming.carbs ||
    local.fat !== incoming.fat ||
    (local.servingName ?? null) !== (incoming.servingName ?? null) ||
    (local.servingGrams ?? null) !== (incoming.servingGrams ?? null) ||
    (local.photo ?? null) !== (incoming.photo ?? null) ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function mealDiffers(local: HealthMeal, incoming: HealthMeal) {
  return (
    local.name !== incoming.name ||
    itemsKey(local.items) !== itemsKey(incoming.items) ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function intakeDiffers(local: HealthIntake, incoming: HealthIntake) {
  return (
    local.dateKey !== incoming.dateKey ||
    local.time !== incoming.time ||
    (local.foodId ?? null) !== (incoming.foodId ?? null) ||
    local.name !== incoming.name ||
    local.grams !== incoming.grams ||
    local.kcal !== incoming.kcal ||
    local.protein !== incoming.protein ||
    local.carbs !== incoming.carbs ||
    local.fat !== incoming.fat ||
    (local.mealId ?? null) !== (incoming.mealId ?? null) ||
    componentsKey(local.components) !== componentsKey(incoming.components) ||
    (local.tdeeSnapshot ?? null) !== (incoming.tdeeSnapshot ?? null) ||
    (local.targetKcalSnapshot ?? null) !== (incoming.targetKcalSnapshot ?? null) ||
    (local.proteinTargetSnapshot ?? null) !== (incoming.proteinTargetSnapshot ?? null) ||
    tombstone(local.deletedAt) !== tombstone(incoming.deletedAt)
  )
}

function profileDiffers(local: HealthProfile, incoming: HealthProfile) {
  return (
    local.sex !== incoming.sex ||
    local.age !== incoming.age ||
    local.heightCm !== incoming.heightCm ||
    local.weightKg !== incoming.weightKg ||
    local.activity !== incoming.activity ||
    (local.tdee ?? null) !== (incoming.tdee ?? null) ||
    (local.targetKcal ?? null) !== (incoming.targetKcal ?? null) ||
    (local.proteinTarget ?? null) !== (incoming.proteinTarget ?? null) ||
    local.plan !== incoming.plan ||
    local.note !== incoming.note ||
    // 下面这几项也住在档案里：漏比就会在融合导入时被备份整份覆盖，本地体重历史和作息设置悄悄丢
    (local.weighDay ?? null) !== (incoming.weighDay ?? null) ||
    local.weighTime !== incoming.weighTime ||
    local.idealBedtime !== incoming.idealBedtime ||
    local.idealWakeTime !== incoming.idealWakeTime ||
    weighInsKey(local.weighIns) !== weighInsKey(incoming.weighIns)
  )
}

/**
 * 健康块的冲突：同 id 但内容不同就算一处，交给用户逐条决定留哪边。
 * 以前是按 updatedAt 自动取新的——看着省事，但会把「本地刚改过」直接盖掉，用户无从选择。
 */
export function findHealthConflicts(
  incoming: HealthPart,
  local: HealthPart,
): MergeConflict[] {
  const conflicts: MergeConflict[] = []

  const localFoods = new Map(local.foods.map((item) => [item.id, item]))
  for (const item of incoming.foods) {
    const mine = localFoods.get(item.id)
    if (!mine || !foodDiffers(mine, item)) continue
    conflicts.push({
      kind: 'food',
      key: item.id,
      label: item.name,
      localText: snippet(foodSummary(mine)),
      incomingText: snippet(foodSummary(item)),
      localBody: foodSummary(mine),
      incomingBody: foodSummary(item),
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localMeals = new Map(local.meals.map((item) => [item.id, item]))
  for (const item of incoming.meals) {
    const mine = localMeals.get(item.id)
    if (!mine || !mealDiffers(mine, item)) continue
    conflicts.push({
      kind: 'meal',
      key: item.id,
      label: item.name,
      localText: snippet(mealSummary(mine)),
      incomingText: snippet(mealSummary(item)),
      localBody: mealSummary(mine),
      incomingBody: mealSummary(item),
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localIntakes = new Map(local.intakes.map((item) => [item.id, item]))
  for (const item of incoming.intakes) {
    const mine = localIntakes.get(item.id)
    if (!mine || !intakeDiffers(mine, item)) continue
    conflicts.push({
      kind: 'intake',
      key: item.id,
      label: `${item.dateKey} · ${item.time} · ${item.name}`,
      localText: snippet(intakeSummary(mine)),
      incomingText: snippet(intakeSummary(item)),
      localBody: intakeSummary(mine),
      incomingBody: intakeSummary(item),
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  const localSleeps = new Map(local.sleeps.map((item) => [item.id, item]))
  for (const item of incoming.sleeps) {
    const mine = localSleeps.get(item.id)
    if (!mine || !sleepDiffers(mine, item)) continue
    conflicts.push({
      kind: 'sleep',
      key: item.id,
      label: item.dateKey + ' \u00b7 ' + item.bedtime + '\u2192' + item.wakeTime,
      localText: snippet(sleepSummary(mine)),
      incomingText: snippet(sleepSummary(item)),
      localBody: sleepSummary(mine),
      incomingBody: sleepSummary(item),
      localDeleted: isDeleted(mine.deletedAt),
      incomingDeleted: isDeleted(item.deletedAt),
      localAt: mine.updatedAt,
      incomingAt: item.updatedAt,
    })
  }

  // 身体档案只有一份：两边都在又不一样时也给用户选
  if (
    incoming.profile &&
    local.profile &&
    profileDiffers(local.profile, incoming.profile)
  ) {
    conflicts.push({
      kind: 'profile',
      key: incoming.profile.id,
      label: '',
      localText: snippet(profileSummary(local.profile)),
      incomingText: snippet(profileSummary(incoming.profile)),
      localBody: profileSummary(local.profile),
      incomingBody: profileSummary(incoming.profile),
      localDeleted: false,
      incomingDeleted: false,
      localAt: local.profile.updatedAt,
      incomingAt: incoming.profile.updatedAt,
    })
  }

  return conflicts
}

/** 按用户的选择把「保留本地」的健康记录从备份里剔掉，其余按备份版本写库 */
export function pickHealth(
  incoming: HealthPart,
  keepLocal: Set<string>,
): HealthPart {
  if (keepLocal.size === 0) return incoming
  return {
    profile:
      incoming.profile && keepLocal.has(conflictKey({ kind: 'profile', key: incoming.profile.id }))
        ? null
        : incoming.profile,
    foods: incoming.foods.filter(
      (item) => !keepLocal.has(conflictKey({ kind: 'food', key: item.id })),
    ),
    meals: incoming.meals.filter(
      (item) => !keepLocal.has(conflictKey({ kind: 'meal', key: item.id })),
    ),
    intakes: incoming.intakes.filter(
      (item) => !keepLocal.has(conflictKey({ kind: 'intake', key: item.id })),
    ),
    sleeps: incoming.sleeps.filter(
      (item) => !keepLocal.has(conflictKey({ kind: 'sleep', key: item.id })),
    ),
  }
}

/** 同名但 id 不同的食物：不自动合并，只提示导入后会多出一条 */
export function duplicateFoodNames(
  incoming: HealthPart,
  local: HealthPart,
): string[] {
  const localNames = new Map(
    local.foods
      .filter((item) => item.deletedAt === null)
      .map((item) => [item.name.trim(), item.id] as const),
  )
  const names = new Set<string>()
  for (const food of incoming.foods) {
    if (food.deletedAt !== null) continue
    const other = localNames.get(food.name.trim())
    if (other && other !== food.id) names.add(food.name.trim())
  }
  return [...names]
}

export interface DiffSegment {
  text: string
  /** 两边相同的部分，显示时压暗 */
  same: boolean
}

/**
 * 「看全文」对照层里「相同内容淡化」的分段：只找公共前缀和公共后缀，中间那段算差异。
 * 中文短句做逐行 diff 噪声太大，这样已经够看出改了哪儿，也不用引入 diff 库。
 */
export function diffText(
  local: string,
  incoming: string,
): { local: DiffSegment[]; incoming: DiffSegment[] } {
  const max = Math.min(local.length, incoming.length)
  let prefix = 0
  while (prefix < max && local[prefix] === incoming[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < max - prefix &&
    local[local.length - 1 - suffix] === incoming[incoming.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const split = (value: string): DiffSegment[] => {
    const parts: DiffSegment[] = []
    if (prefix > 0) parts.push({ text: value.slice(0, prefix), same: true })
    const middle = value.slice(prefix, value.length - suffix)
    if (middle !== '') parts.push({ text: middle, same: false })
    if (suffix > 0) parts.push({ text: value.slice(value.length - suffix), same: true })
    return parts
  }

  return { local: split(local), incoming: split(incoming) }
}
