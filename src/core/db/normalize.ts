/**
 * 把不可信的行数据收成 schema 里定义的样子。
 *
 * 备份文件是用户唯一能救回数据的东西，但它可能来自旧版本、别的设备，甚至被手改过；
 * 直接当类型用，会在某个字段缺失时悄悄写出一条畸形记录，几天后才炸在别处。
 *
 * 规则只有三条：
 *   1. **必填字段缺失或类型不对 → 整行丢掉**，宁可少一条也不要脏数据
 *   2. **可选字段缺失 → 补默认值**，旧版本的行在新版本里照样能读
 *   3. **多出来的字段不管**，新版备份拿到旧版应用里也能降级打开
 *
 * 这层跟存储无关：备份导入、以后的同步、以及从老库升级都走它。
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryImage,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthGoal,
  HealthGoalType,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthMealItem,
  HealthMeasurement,
  HealthActivity,
  HealthProfile,
  HealthSex,
  HealthSleep,
  HealthTraining,
  IntakeComponent,
  ScheduleItem,
  ScheduleRepeat,
  SleepNap,
  SleepWakeEvent,
  TrainingExercise,
  TrainingKind,
  TrainingPlan,
  TrainingSet,
  TrainingTemplate,
  WeighIn,
} from './schema'
import { newCode } from '@/core/utils/id'

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 'HH:MM' 才算数；写坏的（25:99、空串）退回默认时刻 */
function clockText(value: unknown, fallback: string) {
  const raw = text(value)
  const matched = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!matched) return fallback
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? raw : fallback
}

/** 一夜最多记这么多次夜醒，防止手改的备份把弹窗撑爆 */
const MAX_WAKE_EVENTS = 20

/** 一天最多记这么多次小憩，同样挡住手改的备份 */
const MAX_NAPS = 10

/** 逐条夜醒：只保留时刻合法、分钟数是非负整数的条目，坏条目直接剔除 */
function pickWakeEvents(value: unknown): SleepWakeEvent[] {
  if (!Array.isArray(value)) return []
  const events: SleepWakeEvent[] = []
  for (const raw of value.slice(0, MAX_WAKE_EVENTS)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const time = text(item.time)
    const minutes = nullableNumber(item.minutes)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue
    if (minutes === null || minutes < 0 || minutes > 1440) continue
    events.push({ time, minutes: Math.floor(minutes) })
  }
  return events
}

/** 逐条小憩：开始与结束都必须是合法 HH:MM 且结束晚于开始，坏条目直接剔除 */
function pickNaps(value: unknown): SleepNap[] {
  if (!Array.isArray(value)) return []
  const naps: SleepNap[] = []
  for (const raw of value.slice(0, MAX_NAPS)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const start = text(item.start)
    const end = text(item.end)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) continue
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) continue
    if (end <= start) continue
    naps.push({ start, end })
  }
  return naps
}

function deletedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 日期键必须是 YYYY-MM-DD，**并且是日历上真存在的日子**。
 *
 * 只做正则会放过 '2026-13-40' 这种写坏的日期：它一路存进库，
 * 之后所有按天分组、按周统计的地方都会算出莫名其妙的结果。
 */
function dateKey(value: unknown) {
  if (typeof value !== 'string') return null
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? value
    : null
}

/** 一条记录最多带几张图：随记、日记都按这个上限收，防止手改的备份把库撑爆 */
const MAX_IMAGES = 9

/** 一条记录最多带几个标签，单个标签最长多少个字 */
export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 20

/**
 * 标签：去掉首尾空白、压缩内部空白、去重，按上限截断。
 * 空串、纯空白一律不算标签；大小写不一致的重复按原样保留（中文场景用不上忽略大小写）。
 */
export function cleanTags(values: string[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of values) {
    if (typeof raw !== 'string') continue
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    tags.push(name)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

/** 备份 / 旧记录里的 tags：只认字符串数组，坏项剔掉 */
export function pickTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return cleanTags(raw.filter((item): item is string => typeof item === 'string'))
}

/**
 * 记录里内联的图片：只认完整的 dataURL 与正尺寸。
 * 坏图剔掉但**不整行丢弃**——图没了正文还在，这条日记本身还有价值。
 */
export function pickImages(raw: unknown): DiaryImage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry): DiaryImage | null => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      const id = text(item.id)
      const dataUrl = text(item.dataUrl)
      const width = Number(item.width)
      const height = Number(item.height)
      if (id === '' || !dataUrl.startsWith('data:image/')) return null
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return null
      }
      return { id, dataUrl, width, height }
    })
    .filter((item): item is DiaryImage => item !== null)
    .slice(0, MAX_IMAGES)
}

/**
 * 一条一条挑字段：只留 schema 里认识的，顺手把不合格的剔掉（返回 null）。
 * 已知字段缺失时补默认值，缺失的短编号（code）现场生成一个——老备份可能没有它。
 */
export function pickEntry(raw: unknown): DiaryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    content: text(item.content),
    images: pickImages(item.images),
    tags: pickTags(item.tags),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function pickStamp(raw: unknown): DiaryStamp | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const time = text(item.time)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    // 时间必须是合法 HH:MM；坏值留空，不伪造记录时刻
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
    content: text(item.content),
    images: pickImages(item.images),
    tags: pickTags(item.tags),
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function pickPreset(raw: unknown): DiaryPreset | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const name = text(item.name).trim()
  if (id === '' || name === '') return null
  return {
    id,
    code: text(item.code) || newCode(),
    kind: item.kind === 'place' ? 'place' : 'person',
    name,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function pickDay(raw: unknown): DiaryDay | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const day = dateKey(item.dateKey)
  if (day === null) return null
  return {
    dateKey: day,
    // 没写就是 null：空串和 null 两套写法并存，判空的地方早晚漏一处
    weather: text(item.weather) || null,
    updatedAt: number(item.updatedAt, Date.now()),
  }
}

const SEXES: HealthSex[] = ['male', 'female']
const ACTIVITIES: HealthActivity[] = ['sedentary', 'light', 'moderate', 'high']

/** 称重历史只认 { dateKey, weightKg, createdAt }，坏项剔掉；新的在前，最多留 120 条 */
export function pickWeighIns(raw: unknown): WeighIn[] {
  if (!Array.isArray(raw)) return []
  const valid = raw
    .map((entry): WeighIn | null => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      const day = dateKey(item.dateKey)
      const weightKg = Number(item.weightKg)
      if (!day || !Number.isFinite(weightKg) || weightKg <= 0) return null
      return { dateKey: day, weightKg, createdAt: number(item.createdAt, Date.now()) }
    })
    .filter((item): item is WeighIn => item !== null)
  valid.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.createdAt - a.createdAt)
  // 同一天只留最新的一条
  const seen = new Set<string>()
  const deduped = valid.filter((item) => {
    if (seen.has(item.dateKey)) return false
    seen.add(item.dateKey)
    return true
  })
  return deduped.slice(0, 120)
}

const HEALTH_GOAL_TYPES: HealthGoalType[] = [
  'weightRange', 'waistMax', 'strengthReps', 'strengthLoad', 'sleepBedtime', 'proteinDays',
]

/** 目标逐项校验；不合法的目标单独丢弃，不影响档案和其他目标。 */
export function pickHealthGoals(raw: unknown): HealthGoal[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 40).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const id = text(item.id).trim()
    const type = item.type as HealthGoalType
    if (id === '' || !HEALTH_GOAL_TYPES.includes(type)) return []
    const minValue = nullableNumber(item.minValue)
    const maxValue = nullableNumber(item.maxValue)
    const targetValue = nullableNumber(item.targetValue)
    const period = item.period === 'month' ? 'month' : 'week'
    const targetDaysValue = nullableNumber(item.targetDays)
    const maxDays = period === 'week' ? 7 : 31
    const targetDays = targetDaysValue !== null && targetDaysValue >= 1 && targetDaysValue <= maxDays
      ? Math.floor(targetDaysValue)
      : null
    const exerciseName = text(item.exerciseName).trim().slice(0, 80)
    const rawTime = text(item.targetTime)
    const targetTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : ''
    let valid = false
    switch (type) {
      case 'weightRange':
        valid = minValue !== null && maxValue !== null && minValue > 0 && maxValue <= 500 && minValue < maxValue
        break
      case 'waistMax':
        valid = targetValue !== null && targetValue >= 20 && targetValue <= 250
        break
      case 'strengthReps':
        valid = exerciseName !== '' && targetValue !== null && targetValue >= 1 && targetValue <= 1000
        break
      case 'strengthLoad':
        valid = exerciseName !== '' && targetValue !== null && targetValue >= 0 && targetValue <= 1000
        break
      case 'sleepBedtime':
        valid = targetTime !== '' && targetDays !== null
        break
      case 'proteinDays':
        valid = targetValue !== null && targetValue >= 1 && targetValue <= 500 && targetDays !== null
        break
    }
    if (!valid) return []
    const now = Date.now()
    return [{
      id,
      type,
      minValue: type === 'weightRange' ? minValue : null,
      maxValue: type === 'weightRange' ? maxValue : null,
      targetValue: type === 'weightRange' ? null : targetValue,
      targetTime: type === 'sleepBedtime' ? targetTime : '',
      exerciseName: type === 'strengthReps' || type === 'strengthLoad' ? exerciseName : '',
      period,
      targetDays: type === 'sleepBedtime' || type === 'proteinDays' ? targetDays : null,
      enabled: item.enabled !== false,
      createdAt: number(item.createdAt, now),
      updatedAt: number(item.updatedAt, now),
    }]
  })
}

const TRAINING_KINDS: TrainingKind[] = ['strength', 'cardio', 'mobility', 'sport', 'other']

/** 部位键固定英文，界面只在 i18n 里翻译 */
const MUSCLES = [
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

/** 一次训练最多收这么多个动作，手改的备份也不至于把页面撑爆 */
const MAX_EXERCISES = 30

/** 每个动作最多收这么多组 */
const MAX_SETS = 30

export function isTrainingKind(value: unknown): value is TrainingKind {
  return TRAINING_KINDS.includes(value as TrainingKind)
}

/** 一组里的数字：负数、NaN、无穷大一律当没填（null），不静默留脏值 */
function setNumber(value: unknown, min: number, max: number): number | null {
  const parsed = nullableNumber(value)
  if (parsed === null || parsed < min || parsed > max) return null
  return parsed
}

function pickSets(raw: unknown): TrainingSet[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_SETS).map((entry) => {
    const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      reps: setNumber(item.reps, 0, 1000),
      weightKg: setNumber(item.weightKg, 0, 1000),
      durationSec: setNumber(item.durationSec, 0, 86400),
      restSec: setNumber(item.restSec, 0, 3600),
      rpe: setNumber(item.rpe, 1, 10),
    }
  })
}

export function pickExercises(raw: unknown): TrainingExercise[] {
  if (!Array.isArray(raw)) return []
  const list: TrainingExercise[] = []
  for (const entry of raw.slice(0, MAX_EXERCISES)) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const name = text(item.name).trim()
    if (name === '') continue
    const id = text(item.id)
    const kind = text(item.kind)
    const muscle = text(item.muscle)
    list.push({
      id: id === '' ? `ex-${newCode()}` : id,
      name,
      kind: isTrainingKind(kind) ? kind : 'other',
      muscle: MUSCLES.includes(muscle) ? muscle : 'other',
      sets: pickSets(item.sets),
      durationMin: setNumber(item.durationMin, 0, 1440),
      distanceKm: setNumber(item.distanceKm, 0, 1000),
      note: text(item.note),
    })
  }
  return list
}

export function pickTraining(raw: unknown): HealthTraining | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const time = text(item.time)
  const kind = text(item.kind)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
    kind: isTrainingKind(kind) ? kind : 'other',
    title: text(item.title),
    exercises: pickExercises(item.exercises),
    durationMin: setNumber(item.durationMin, 0, 1440),
    feeling: setNumber(item.feeling, 1, 5),
    note: text(item.note),
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

/** 训练提醒设置：没有字段就是 undefined；周几只认 1–7，坏值直接清空 */
export function pickTrainingPlan(raw: unknown): TrainingPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const item = raw as Record<string, unknown>
  const weeklyDays = Array.isArray(item.weeklyDays)
    ? [
        ...new Set(
          item.weeklyDays
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
        ),
      ].sort((a, b) => a - b)
    : []
  const nudge = nullableNumber(item.nudgeAfterDays)
  const templates: TrainingTemplate[] = []
  if (Array.isArray(item.templates)) {
    for (const rawTemplate of item.templates.slice(0, 40)) {
      if (!rawTemplate || typeof rawTemplate !== 'object') continue
      const template = rawTemplate as Record<string, unknown>
      const id = text(template.id).trim()
      const name = text(template.name).trim().slice(0, 80)
      if (id === '' || name === '') continue
      const exercises = pickExercises(template.exercises)
      const durationMin = setNumber(template.durationMin, 0, 1440)
      if (exercises.length === 0 && durationMin === null) continue
      const kind = text(template.kind)
      templates.push({
        id,
        name,
        kind: isTrainingKind(kind) ? kind : 'other',
        title: text(template.title).slice(0, 120),
        exercises,
        durationMin,
      })
    }
  }
  return {
    enabled: item.enabled === true,
    weeklyDays,
    time: clockText(item.time, '20:00'),
    nudgeAfterDays: nudge !== null && nudge >= 0 && nudge <= 30 ? Math.floor(nudge) : 3,
    templates,
  }
}

export function pickProfile(raw: unknown): HealthProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const sex = SEXES.includes(item.sex as HealthSex) ? (item.sex as HealthSex) : null
  const activity = ACTIVITIES.includes(item.activity as HealthActivity)
    ? (item.activity as HealthActivity)
    : null
  return {
    id: 'me',
    sex,
    age: nullableNumber(item.age),
    heightCm: nullableNumber(item.heightCm),
    weightKg: nullableNumber(item.weightKg),
    weightAt: nullableNumber(item.weightAt),
    activity,
    tdee: nullableNumber(item.tdee),
    targetKcal: nullableNumber(item.targetKcal),
    proteinTarget: nullableNumber(item.proteinTarget),
    plan: text(item.plan),
    note: text(item.note),
    weighDay: nullableNumber(item.weighDay),
    weighTime: text(item.weighTime) || '07:00',
    idealBedtime: clockText(item.idealBedtime, '23:00'),
    idealWakeTime: clockText(item.idealWakeTime, '07:00'),
    weighIns: pickWeighIns(item.weighIns),
    goals: pickHealthGoals(item.goals),
    trainingPlan: pickTrainingPlan(item.trainingPlan),
    updatedAt: number(item.updatedAt, Date.now()),
  }
}

export function pickFood(raw: unknown): HealthFood | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const name = text(item.name).trim()
  if (id === '' || name === '') return null
  return {
    id,
    code: text(item.code) || newCode(),
    name,
    tags: pickTags(item.tags),
    kcal: number(item.kcal, 0),
    protein: number(item.protein, 0),
    carbs: number(item.carbs, 0),
    fat: number(item.fat, 0),
    servingName: typeof item.servingName === 'string' ? item.servingName : null,
    servingGrams: nullableNumber(item.servingGrams),
    photo:
      typeof item.photo === 'string' && item.photo.startsWith('data:image/') ? item.photo : null,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

/** 套餐只认 { foodId: string, grams: number }，坏项剔掉 */
function pickMealItems(raw: unknown): HealthMealItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      const foodId = text(item.foodId)
      const grams = Number(item.grams)
      if (foodId === '' || !Number.isFinite(grams) || grams <= 0) return null
      return { foodId, grams }
    })
    .filter((item): item is HealthMealItem => item !== null)
}

export function pickMeal(raw: unknown): HealthMeal | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const name = text(item.name).trim()
  if (id === '' || name === '') return null
  return {
    id,
    name,
    items: pickMealItems(item.items),
    photo:
      typeof item.photo === 'string' && item.photo.startsWith('data:image/') ? item.photo : null,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

function pickComponents(raw: unknown): IntakeComponent[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      return {
        foodId: typeof item.foodId === 'string' ? item.foodId : null,
        name: text(item.name),
        grams: number(item.grams, 0),
        kcal: number(item.kcal, 0),
        protein: number(item.protein, 0),
        carbs: number(item.carbs, 0),
        fat: number(item.fat, 0),
      }
    })
    .filter((item): item is IntakeComponent => item !== null)
}

export function pickIntake(raw: unknown): HealthIntake | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  const name = text(item.name).trim()
  if (id === '' || day === null || name === '') return null
  const time = text(item.time)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
    foodId: typeof item.foodId === 'string' ? item.foodId : null,
    name,
    grams: number(item.grams, 0),
    kcal: number(item.kcal, 0),
    protein: number(item.protein, 0),
    carbs: number(item.carbs, 0),
    fat: number(item.fat, 0),
    source: item.source === 'library' ? 'library' : 'manual',
    mealId: typeof item.mealId === 'string' ? item.mealId : null,
    components: pickComponents(item.components),
    // 旧记录没有这三个口径：显式给 null，别让对象形状随版本漂
    tdeeSnapshot: nullableNumber(item.tdeeSnapshot) ?? null,
    targetKcalSnapshot: nullableNumber(item.targetKcalSnapshot) ?? null,
    proteinTargetSnapshot: nullableNumber(item.proteinTargetSnapshot) ?? null,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function pickSleep(raw: unknown): HealthSleep | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const bedtime = text(item.bedtime)
  const wakeTime = text(item.wakeTime)
  const quality = nullableNumber(item.quality)
  // 夜醒次数 / 累计分钟：只认 0 以上的整数，缺失或坏值当成没记
  const wakeCount = nullableNumber(item.wakeCount)
  const wakeMinutes = nullableNumber(item.wakeMinutes)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    // 时刻必须是合法 HH:MM；坏值留空，不伪造记录时刻
    bedtime: /^([01]\d|2[0-3]):[0-5]\d$/.test(bedtime) ? bedtime : '',
    wakeTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime) ? wakeTime : '',
    // 只认 1–5，越界或缺失都算没评
    quality: quality !== null && quality >= 1 && quality <= 5 ? quality : null,
    // 逐条夜醒；旧备份没有这个字段时留空数组，下面再用旧口径兜底
    wakeEvents: pickWakeEvents(item.wakeEvents),
    // 白日小憩；旧备份没有这个字段时留空数组
    naps: pickNaps(item.naps),
    wakeCount:
      wakeCount !== null && wakeCount >= 0 && wakeCount <= 99 ? Math.floor(wakeCount) : null,
    wakeMinutes:
      wakeMinutes !== null && wakeMinutes >= 0 && wakeMinutes <= 1440
        ? Math.floor(wakeMinutes)
        : null,
    note: text(item.note),
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

/** 身体测量必填日期和至少一个有效实测字段；坏字段单独清空。 */
export function pickMeasurement(raw: unknown): HealthMeasurement | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const day = dateKey(item.dateKey)
  if (day === null) return null
  const centimeters = (value: unknown) => {
    const numberValue = nullableNumber(value)
    return numberValue !== null && numberValue >= 20 && numberValue <= 250
      ? Math.round(numberValue * 10) / 10
      : null
  }
  const waistCm = centimeters(item.waistCm)
  const abdomenCm = centimeters(item.abdomenCm)
  const chestCm = centimeters(item.chestCm)
  const upperArmCm = centimeters(item.upperArmCm)
  const thighCm = centimeters(item.thighCm)
  const calfCm = centimeters(item.calfCm)
  const neckCm = centimeters(item.neckCm)
  const bodyFat = nullableNumber(item.bodyFatPct)
  const bodyFatPct = bodyFat !== null && bodyFat >= 1 && bodyFat <= 75
    ? Math.round(bodyFat * 10) / 10
    : null
  if ([waistCm, abdomenCm, chestCm, upperArmCm, thighCm, calfCm, neckCm, bodyFatPct].every((value) => value === null)) {
    return null
  }
  const now = Date.now()
  return {
    dateKey: day,
    waistCm,
    abdomenCm,
    chestCm,
    upperArmCm,
    thighCm,
    calfCm,
    neckCm,
    bodyFatPct,
    createdAt: number(item.createdAt, now),
    updatedAt: number(item.updatedAt, now),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function pickFinance(raw: unknown): FinanceEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const createdAt = number(item.createdAt, Date.now())
  const time = text(item.time)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    // 没有明确记录时刻就留空，不根据创建时间伪造用户输入
    time: time === ''
      ? ''
      : /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)
      ? time.length === 5
        ? `${time}:00`
        : time
      : '',
    // 旧占位数据没有方向，统一按支出口径读；金额一律收成正数
    kind: item.kind === 'income' ? 'income' : 'expense',
    category: text(item.category),
    name: text(item.name),
    amount: Math.abs(number(item.amount, 0)),
    photo:
      typeof item.photo === 'string' && item.photo.startsWith('data:image/') ? item.photo : null,
    note: text(item.note),
    createdAt,
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

const SCHEDULE_REPEATS: ScheduleRepeat[] = ['none', 'daily', 'weekly']

/** 周几：只认 1–7，去重排序；超出范围的手改数据直接丢掉 */
export function pickWeeklyDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort(
    (a, b) => a - b,
  )
}

/**
 * 日程 / 定期任务：标题为空或日期不合法就整行丢掉；
 * 重复方式、周几、完成记录都按上限收紧，手改的备份不至于把页面撑爆。
 */
export function pickSchedule(raw: unknown): ScheduleItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  const title = text(item.title).trim()
  if (id === '' || day === null || title === '') return null
  const repeat = SCHEDULE_REPEATS.includes(item.repeat as ScheduleRepeat)
    ? (item.repeat as ScheduleRepeat)
    : 'none'
  const weeklyDays = repeat === 'weekly' ? pickWeeklyDays(item.weeklyDays) : []
  const doneDays = Array.isArray(item.doneDays)
    ? [...new Set(item.doneDays.map((value) => dateKey(value)).filter((value): value is string => value !== null))]
        .sort()
        .slice(-400)
    : []
  const time = text(item.time)
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
    title,
    note: text(item.note),
    repeat,
    weeklyDays,
    remind: item.remind === true,
    doneAt: deletedAt(item.doneAt),
    doneDays,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: deletedAt(item.deletedAt),
  }
}

export function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function bag(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
