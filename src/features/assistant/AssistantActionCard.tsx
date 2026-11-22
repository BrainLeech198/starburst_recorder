/**
 * 一张待确认的动作卡片。
 *
 * 助手的写操作都先落在这里：写清楚「要记什么」，用户点确认才真的写库；
 * 写完之后还能撤销。卡片状态跟着对话一起存档，刷新后不会变成一团空白。
 *
 * 确认前可以直接改数字和内容：不然「米饭 150 克记成 250 克」得先写入再走一轮
 * update，既多绕一次模型、也多一条容易记错的中间状态。
 */
import { useState } from 'react'
import type { AssistantData } from '@/core/db/store'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { formatNum, mealTotals } from '@/features/health/healthMath'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { AssistantMemoryKind } from './assistantMemory'
import type { ChatActionState } from './assistantChatStore'
import type { AssistantAction, MealItemArg } from './assistantActionBuild'
import { applyEdits, draftOf, draftValid, editFields } from './assistantActionEdit'
import { isDeleteKind } from './assistantPermission'
import { categoryKey } from '@/features/finance/financeCategories'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'

const KIND_KEYS: Record<AssistantMemoryKind, MessageKey> = {
  preference: 'memory.kind.preference',
  goal: 'memory.kind.goal',
  habit: 'memory.kind.habit',
  fact: 'memory.kind.fact',
}

const STATUS_KEYS: Record<ChatActionState['status'], MessageKey> = {
  pending: 'assistant.action.pending',
  done: 'assistant.action.done',
  undone: 'assistant.action.undone',
  canceled: 'assistant.action.canceled',
  failed: 'assistant.action.failed',
}

interface Props {
  state: ChatActionState
  busy: boolean
  data: Pick<AssistantData, 'foods' | 'meals'> | null
  catalogLoading: boolean
  catalogError: boolean
  onRetryCatalog: () => void
  onConfirm: () => void
  onCancel: () => void
  onUndo: () => void
  /** 确认前改内容：只替换这张卡片里的动作，不写库 */
  onEdit?: (next: AssistantAction) => void
}

interface MealDraftItem {
  foodId: string
  grams: string
}

type ActionCardData = Pick<AssistantData, 'foods' | 'meals'>

function actionMealItems(action: AssistantAction, data: ActionCardData | null): MealItemArg[] {
  if (action.kind === 'mealCreate') return action.items
  if (action.kind === 'mealEdit' && action.items !== undefined) {
    return action.items
  }
  if (action.kind !== 'mealEdit' && action.kind !== 'mealDelete') return []
  const meal = data?.meals.find((item) => item.id === action.mealId && item.deletedAt === null)
  if (!meal) return []
  return meal.items.map((item) => ({
    foodId: item.foodId,
    name: data?.foods.find((food) => food.id === item.foodId)?.name ?? item.foodId,
    grams: item.grams,
  }))
}

function mealDetails(
  items: MealItemArg[],
  data: ActionCardData | null,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
) {
  if (items.length === 0) return ''
  const foods = data?.foods.filter((food) => food.deletedAt === null) ?? []
  const byId = new Map(foods.map((food) => [food.id, food]))
  const parts = items.map((item) => {
    const food = byId.get(item.foodId)
    return `${food?.name ?? item.name} ${formatNum(item.grams)} g${food ? '' : `（${t('foods.mealUnknownPart')}）`}`
  })
  const result = mealTotals(items, foods)
  const macroTotals = `${t('foods.carbs')} ${formatNum(result.carbs)} · ${t('foods.fat')} ${formatNum(result.fat)}`
  const total = data === null
    ? ''
    : `\n${t('foods.mealTotal', {
        kcal: formatNum(result.kcal),
        protein: formatNum(result.protein),
        grams: formatNum(result.grams),
      })} · ${macroTotals}${result.missing > 0 ? ` · ${t('foods.mealMissing', { n: result.missing })}` : ''}`
  return `\n${t('foods.mealParts')}：${parts.join('、')}${total}`
}

function foodNutrition(
  food: { kcal: number; protein: number; carbs: number; fat: number },
  t: (key: MessageKey) => string,
) {
  return `${t('foods.kcal')} ${formatNum(food.kcal)} / 100g · ${t('foods.protein')} ${formatNum(food.protein)} / 100g · ${t('foods.carbs')} ${formatNum(food.carbs)} / 100g · ${t('foods.fat')} ${formatNum(food.fat)} / 100g`
}

/** 卡片只做预览：日记正文可能很长，别把整个对话撑成一张纸 */
function preview(text: string, max = 600) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function changeValue(field: MessageKey, value: string, action: AssistantAction, t: (key: MessageKey) => string) {
  if (value === '—') return value
  if (field === 'assistant.change.direction') {
    return t(value === 'income' ? 'finance.income' : 'finance.expense')
  }
  if (field === 'schedule.fieldRemind') {
    return value === 'true' ? t('schedule.remindOn') : t('assistant.change.disabled')
  }
  if (field === 'finance.category') return t(categoryKey(value))
  if (field === 'schedule.fieldRepeat') {
    if (value === 'none') return t('schedule.repeatNone')
    if (value === 'daily') return t('schedule.repeatDaily')
    if (value === 'weekly') return t('schedule.repeatWeekly')
  }
  if (field === 'schedule.fieldWeeklyDays') {
    return value
      .split('、')
      .map(Number)
      .map((day) => t((`date.weekdayShort${day % 7}`) as MessageKey))
      .join('、')
  }
  if (field === 'profile.sex') {
    if (value === 'male') return t('profile.male')
    if (value === 'female') return t('profile.female')
  }
  if (field === 'profile.activity') {
    const activityKeys: Record<string, MessageKey> = {
      sedentary: 'profile.activitySedentary',
      light: 'profile.activityLight',
      moderate: 'profile.activityModerate',
      high: 'profile.activityHigh',
    }
    if (activityKeys[value]) return t(activityKeys[value])
  }
  if (field === 'assistant.change.kind') {
    if (action.kind === 'presetEdit') return t(value === 'person' ? 'presets.person' : 'presets.place')
    if (action.kind === 'memoryEdit') {
      const memoryKey = KIND_KEYS[value as AssistantMemoryKind]
      if (memoryKey) return t(memoryKey)
    }
    if (action.kind === 'trainingEdit') {
      const trainingKeys: Record<string, MessageKey> = {
        strength: 'training.kind.strength', cardio: 'training.kind.cardio',
        mobility: 'training.kind.mobility', sport: 'training.kind.sport', other: 'training.kind.other',
      }
      if (trainingKeys[value]) return t(trainingKeys[value])
    }
  }
  return value
}

export default function AssistantActionCard({
  state,
  busy,
  data,
  catalogLoading,
  catalogError,
  onRetryCatalog,
  onConfirm,
  onCancel,
  onUndo,
  onEdit,
}: Props) {
  const { t } = useI18n()
  const { action } = state
  const fields = editFields(action)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [mealDraftItems, setMealDraftItems] = useState<MealDraftItem[] | null>(null)
  const date = 'dateKey' in action ? formatDate(action.dateKey, t) : ''
  const currentMealItems = actionMealItems(action, data)
  const availableFoods = data?.foods.filter((food) => food.deletedAt === null) ?? []

  const body = (() => {
    switch (action.kind) {
      case 'scheduleCreate': {
        const days = action.weeklyDays.map((day) => t((`date.weekdayShort${day % 7}`) as MessageKey)).join('、')
        const repeat = action.repeat === 'daily'
          ? t('schedule.everyDay')
          : action.repeat === 'weekly'
            ? t('schedule.everyWeek', { days })
            : action.repeat === 'monthly'
              ? t('schedule.everyMonth', { days: action.monthlyDays.join('/') })
              : action.repeat === 'yearly'
                ? t('schedule.everyYear', { dates: action.yearlyDates.join('/') })
            : t('schedule.onlyOnce')
        return `${t('schedule.addTitle')} · ${date}${action.time ? ` ${action.time}` : ''} · ${preview(action.title)} · ${repeat}${action.remind ? ` · ${t('schedule.remindOn')}` : ''}${action.note ? ` · ${preview(action.note, 100)}` : ''}`
      }
      case 'scheduleEdit': {
        const details = [
          action.newDateKey ? `${t('schedule.fieldDate')} ${formatDate(action.newDateKey, t)}` : '',
          action.time === undefined ? '' : `${t('schedule.fieldTime')} ${action.time || '—'}`,
          action.newTitle ? `${t('schedule.fieldTitle')} ${preview(action.newTitle)}` : '',
          action.note === undefined ? '' : `${t('schedule.fieldNote')} ${preview(action.note, 100) || '—'}`,
          action.repeat ? `${t('schedule.fieldRepeat')} ${t(({
            none: 'schedule.repeatNone', daily: 'schedule.repeatDaily', weekly: 'schedule.repeatWeekly',
            monthly: 'schedule.repeatMonthly', yearly: 'schedule.repeatYearly',
          } as const)[action.repeat])}` : '',
          action.weeklyDays?.length ? action.weeklyDays.map((day) => t((`date.weekdayShort${day % 7}`) as MessageKey)).join('、') : '',
          action.monthlyDays?.length ? `${t('schedule.monthlyDaysLabel')} ${action.monthlyDays.join('、')}` : '',
          action.yearlyDates?.length ? `${t('schedule.yearlyDatesLabel')} ${action.yearlyDates.join('、')}` : '',
          action.remind === undefined ? '' : `${t('schedule.fieldRemind')} ${action.remind ? t('schedule.remindOn') : '—'}`,
        ].filter(Boolean).join(' · ')
        return `${t('schedule.editTitle')} · ${date} · ${preview(action.title)}（${action.code}） · ${details}`
      }
      case 'scheduleDelete':
        return `${t('schedule.deleteTitle')} · ${date} · ${preview(action.title)}（${action.code}）`
      case 'memory':
        return t('assistant.action.memory', { text: preview(action.text) })
      case 'finance':
        return t('assistant.action.finance', {
          date,
          direction: t(
            action.direction === 'income'
              ? 'assistant.action.financeIncome'
              : 'assistant.action.financeExpense',
          ),
          name: action.name,
          amount: action.amount,
        })
      case 'stamp':
        return t('assistant.action.stamp', {
          date,
          time: action.time,
          content: preview(action.content),
        })
      case 'diary':
        return t('assistant.action.diary', { date, content: preview(action.content) })
      case 'sleep':
        return `${t('assistant.action.sleep', {
          date,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
        })}${
          action.quality === null
            ? ''
            : t('assistant.action.sleepQuality', { quality: action.quality })
        }`
      case 'weigh':
        return t('assistant.action.weigh', { date, weight: action.weightKg })
      case 'weighEdit':
        return `${t('assistant.action.weigh', { date, weight: action.weightKg })}（${action.previousKg} → ${action.weightKg} kg）`
      case 'intake':
        return t('assistant.action.intake', {
          date,
          time: action.time,
          name: action.name,
          grams: action.grams,
          kcal: action.kcal,
        })
      case 'training': {
        const detail = action.exercises
          .map((exercise) => {
            const sets = exercise.sets
              .map((set) => {
                const reps = set.reps === null ? '—' : String(set.reps)
                const weight = set.weightKg === null ? '' : `×${set.weightKg}`
                return `${reps}${weight}`
              })
              .join('/')
            return sets === '' ? exercise.name : `${exercise.name} ${sets}`
          })
          .join('，')
        return `${t('training.actionAdd')} · ${date} ${action.time}${
          detail === '' ? '' : ` · ${detail}`
        }`
      }
      case 'trainingEdit': {
        const detail = [
          action.time ?? '',
          action.title ?? '',
          action.durationMin === undefined ? '' : `${action.durationMin} min`,
          action.note ?? '',
        ]
          .filter((part) => part !== '')
          .join(' · ')
        return `${t('training.actionUpdate')}（${action.code}）${detail === '' ? '' : ` · ${detail}`}`
      }
      case 'trainingDelete':
        return `${t('training.actionDelete')} · ${date} · ${action.label}`
      case 'profileCreate':
      case 'profileEdit': {
        const fields = [
          action.sex === undefined ? '' : `${t('profile.sex')} ${t(action.sex === 'male' ? 'profile.male' : 'profile.female')}`,
          action.age === undefined ? '' : `${t('profile.age')} ${action.age}`,
          action.heightCm === undefined ? '' : `${t('profile.height')} ${action.heightCm}`,
          action.weightKg === undefined ? '' : `${t('profile.weight')} ${action.weightKg}`,
          action.activity === undefined ? '' : `${t('profile.activity')} ${t(({
            sedentary: 'profile.activitySedentary', light: 'profile.activityLight',
            moderate: 'profile.activityModerate', high: 'profile.activityHigh',
          } as const)[action.activity])}`,
          action.tdee === undefined ? '' : `${t('profile.tdee')} ${action.tdee}`,
          action.targetKcal === undefined ? '' : `${t('profile.target')} ${action.targetKcal}`,
          action.proteinTarget === undefined ? '' : `${t('profile.proteinTarget')} ${action.proteinTarget}`,
          action.idealBedtime === undefined ? '' : `${t('health.idealBedtime')} ${action.idealBedtime}`,
          action.idealWakeTime === undefined ? '' : `${t('health.idealWake')} ${action.idealWakeTime}`,
          action.note === undefined ? '' : `${t('profile.note')} ${preview(action.note, 100)}`,
        ].filter(Boolean)
        return `${t('profile.title')} · ${fields.join(' · ')}`
      }
      case 'profileDelete':
        return `${t('assistant.action.deleteTitle')} · ${t('profile.title')} · ${t('health.trendHistory')} ${action.weighCount}`
      case 'diaryEdit':
        return t('assistant.action.diaryEdit', { date, content: preview(action.content) })
      case 'stampEdit': {
        const detail = [action.time ?? '', action.content ? preview(action.content) : '']
          .filter((part) => part !== '')
          .join(' · ')
        return t('assistant.action.stampEdit', { date, detail })
      }
      case 'financeEdit': {
        const detail = [
          action.name ?? '',
          action.amount === undefined ? '' : String(action.amount),
          action.direction === undefined
            ? ''
            : t(
                action.direction === 'income'
                  ? 'assistant.action.financeIncome'
                  : 'assistant.action.financeExpense',
              ),
          action.category === undefined ? '' : t(categoryKey(action.category)),
          action.note ?? '',
        ]
          .filter((part) => part !== '')
          .join(' · ')
        return t('assistant.action.financeEdit', { date, detail })
      }
      case 'financeDelete':
        return t('assistant.action.financeDelete', {
          date,
          name: action.name,
          amount: action.amount,
        })
      case 'stampDelete':
        return t('assistant.action.stampDelete', { date, content: preview(action.content) })
      case 'intakeDelete':
        return t('assistant.action.intakeDelete', { date, name: action.name, kcal: action.kcal })
      case 'sleepDelete':
        return t('assistant.action.sleepDelete', {
          date,
          bedtime: action.bedtime,
          wakeTime: action.wakeTime,
        })
      case 'foodCreate':
        return `${t('foods.add')} · ${action.name}\n${foodNutrition(action, t)}${action.servingName || action.servingGrams ? `\n${t('foods.servingName')}：${action.servingName || '—'}${action.servingGrams ? ` · ${action.servingGrams} g` : ''}` : ''}`
      case 'foodEdit': {
        const old = data?.foods.find((item) => item.code === action.code && item.deletedAt === null)
        const targetName = action.name ?? old?.name ?? action.code
        const nutrition = old
          ? foodNutrition({
              kcal: action.kcal ?? old.kcal,
              protein: action.protein ?? old.protein,
              carbs: action.carbs ?? old.carbs,
              fat: action.fat ?? old.fat,
            }, t)
          : [
              action.kcal === undefined ? '' : `${t('foods.kcal')} ${formatNum(action.kcal)} / 100g`,
              action.protein === undefined ? '' : `${t('foods.protein')} ${formatNum(action.protein)}`,
              action.carbs === undefined ? '' : `${t('foods.carbs')} ${formatNum(action.carbs)}`,
              action.fat === undefined ? '' : `${t('foods.fat')} ${formatNum(action.fat)}`,
            ].filter(Boolean).join(' · ')
        const servingName = action.servingName === undefined ? old?.servingName : action.servingName
        const servingGrams = action.servingGrams === undefined ? old?.servingGrams : action.servingGrams
        return `${t('foods.edit')} · ${targetName}（${action.code}）${nutrition ? `\n${nutrition}` : ''}${servingName || servingGrams ? `\n${t('foods.servingName')}：${servingName || '—'}${servingGrams ? ` · ${servingGrams} g` : ''}` : ''}`
      }
      case 'foodDelete': {
        const food = data?.foods.find((item) => item.code === action.code && item.deletedAt === null)
        return `${t('foods.delete')} · ${food?.name ?? action.name}（${action.code}）${food ? `\n${foodNutrition(food, t)}${food.servingName || food.servingGrams ? `\n${t('foods.servingName')}：${food.servingName || '—'}${food.servingGrams ? ` · ${food.servingGrams} g` : ''}` : ''}` : ''}`
      }
      case 'mealCreate':
        return `${t('foods.mealSave')} · ${action.name}${mealDetails(action.items, data, t)}`
      case 'mealEdit': {
        const old = data?.meals.find((item) => item.id === action.mealId && item.deletedAt === null)
        const targetName = action.name ?? old?.name ?? action.mealId
        const title = action.name && old && action.name !== old.name
          ? `${old.name} → ${action.name}`
          : targetName
        return `${t('foods.mealEdit')} · ${title}${mealDetails(currentMealItems, data, t)}`
      }
      case 'mealDelete':
        return `${t('foods.mealDeleteTitle', { name: action.name })}${mealDetails(currentMealItems, data, t)}`
    }
  })()

  const isEdit = action.kind.endsWith('Edit')
  /** 删除标题走和权限层同一份名单，别让显示与确认策略各认一套 */
  const isDelete = isDeleteKind(action.kind)

  const pending = state.status === 'pending' || state.status === 'failed'
  const needsCatalogData =
    action.kind === 'foodEdit' || action.kind === 'foodDelete' ||
    action.kind === 'mealCreate' || action.kind === 'mealEdit' || action.kind === 'mealDelete'
  const catalogUnavailable = needsCatalogData && data === null
  const tone = pending
    ? 'border-brand/50 bg-brand/5'
    : state.status === 'done'
      ? 'border-line bg-surface-2'
      : 'border-line bg-surface opacity-70'

  /** 只有还没写入的卡片能改；已经写进去的只能撤销，改要走 update 流程 */
  const needsMealData = action.kind === 'mealEdit' && action.items === undefined
  const canEdit = Boolean(onEdit) && fields.length > 0 && pending && !catalogUnavailable && (!needsMealData || data !== null)
  const editing = draft !== null && canEdit
  const valid = draft !== null && draftValid(fields, draft)

  function openEdit() {
    const next = draftOf(action)
    if (action.kind === 'mealCreate' || action.kind === 'mealEdit') {
      const rows = currentMealItems.map((item) => ({ foodId: item.foodId, grams: String(item.grams) }))
      setMealDraftItems(rows)
      next.items = JSON.stringify(currentMealItems)
    }
    setDraft(next)
  }

  function updateMealRows(rows: MealDraftItem[]) {
    setMealDraftItems(rows)
    const serialized = rows.map((row) => {
      const food = availableFoods.find((item) => item.id === row.foodId)
      const fallback = currentMealItems.find((item) => item.foodId === row.foodId)
      return {
        foodId: row.foodId,
        name: food?.name ?? fallback?.name ?? row.foodId,
        grams: Number(row.grams),
      }
    })
    setDraft((current) => current ? { ...current, items: JSON.stringify(serialized) } : current)
  }

  function saveEdits() {
    if (!draft || !onEdit) return
    let next = applyEdits(action, draft)
    if (!next) return
    if (action.kind === 'mealEdit' && action.items === undefined && next.kind === 'mealEdit') {
      const before = currentMealItems.map(({ foodId, grams }) => `${foodId}:${grams}`).join('|')
      const after = (next.items ?? []).map(({ foodId, grams }) => `${foodId}:${grams}`).join('|')
      if (before === after) {
        next = { ...next }
        delete next.items
      }
    }
    onEdit(next)
    setDraft(null)
    setMealDraftItems(null)
  }

  return (
    <div className={`w-full rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-brand">
          {action.kind === 'memory'
            ? t('assistant.action.memoryKind', {
                kind: t(KIND_KEYS[action.memoryKind]),
              })
            : isDelete
              ? t('assistant.action.deleteTitle')
              : isEdit
                ? t('assistant.action.editTitle')
                : t('assistant.action.title')}
        </span>
        <span
          className={`rounded-full border border-line px-2 py-0.5 text-[10px] ${
            state.status === 'done'
              ? 'text-brand'
              : state.status === 'failed'
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {t(STATUS_KEYS[state.status])}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1 text-[11px] text-muted">
              <span>{t(field.label)}</span>
              {field.kind === 'mealItems' ? (
                <div className="flex flex-col gap-2">
                  {(mealDraftItems ?? []).map((item, index) => {
                    const fallback = currentMealItems.find((part) => part.foodId === item.foodId)
                    return (
                      <div key={`${item.foodId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
                        <select
                          value={item.foodId}
                          aria-label={`${t(field.label)} ${index + 1}`}
                          onChange={(event) => updateMealRows((mealDraftItems ?? []).map((row, rowIndex) =>
                            rowIndex === index ? { ...row, foodId: event.target.value } : row,
                          ))}
                          className={`${INPUT} min-w-0 text-sm`}
                        >
                          <option value="">{t('foods.mealSearch')}</option>
                          {item.foodId !== '' && !availableFoods.some((food) => food.id === item.foodId) && (
                            <option value={item.foodId}>{fallback?.name ?? t('foods.mealUnknownPart')}</option>
                          )}
                          {availableFoods.map((food) => (
                            <option key={food.id} value={food.id}>{food.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          step={1}
                          value={item.grams}
                          aria-label={`${t('assistant.edit.grams')} ${index + 1}`}
                          onChange={(event) => updateMealRows((mealDraftItems ?? []).map((row, rowIndex) =>
                            rowIndex === index ? { ...row, grams: event.target.value } : row,
                          ))}
                          className={`${INPUT} text-sm`}
                        />
                        <button
                          type="button"
                          onClick={() => updateMealRows((mealDraftItems ?? []).filter((_, rowIndex) => rowIndex !== index))}
                          disabled={(mealDraftItems?.length ?? 0) <= 1}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      if (availableFoods.length > 0) updateMealRows([...(mealDraftItems ?? []), { foodId: '', grams: '100' }])
                    }}
                    disabled={availableFoods.length === 0 || (mealDraftItems?.length ?? 0) >= 20}
                    className="self-start rounded-lg border border-line px-3 py-2 text-xs text-fg hover:bg-surface-2 disabled:opacity-40"
                  >
                    {t('foods.mealAddPart')}
                  </button>
                  {(mealDraftItems?.length ?? 0) > 0 && (
                    <p className="m-0 whitespace-pre-wrap text-[11px] text-muted">
                      {mealDetails((mealDraftItems ?? []).filter((row) => row.foodId !== '').map((row) => ({
                        foodId: row.foodId,
                        name: currentMealItems.find((part) => part.foodId === row.foodId)?.name ?? row.foodId,
                        grams: Number(row.grams) || 0,
                      })), data, t)}
                    </p>
                  )}
                </div>
              ) : field.kind === 'textarea' ? (
                <textarea
                  rows={4}
                  value={draft?.[field.key] ?? ''}
                  aria-label={t(field.label)}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                  className={`${INPUT} text-sm`}
                />
              ) : (
                <input
                  type={field.kind}
                  step={field.step}
                  min={field.min}
                  max={field.max}
                  maxLength={field.maxLength}
                  value={draft?.[field.key] ?? ''}
                  aria-label={t(field.label)}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [field.key]: event.target.value } : current,
                    )
                  }
                  className={`${INPUT} text-sm`}
                />
              )}
            </div>
          ))}
          {!valid && <p className="m-0 text-[11px] text-danger">{t('assistant.edit.invalid')}</p>}
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg">{body}</p>
      )}

      {!editing && state.changes && state.changes.length > 0 && (
        <div className="mt-2 rounded-lg bg-surface-2 p-2.5">
          <p className="mb-1 text-[11px] font-medium text-muted">{t('assistant.changes.title')}</p>
          <dl className="m-0 flex flex-col gap-1.5">
            {state.changes.map((change, index) => (
              <div key={`${change.field}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs">
                <dt className="m-0 text-muted">{t(change.field)}</dt>
                <dd className="m-0 max-h-40 overflow-y-auto break-words whitespace-pre-wrap text-fg">
                  <span className="text-muted">{changeValue(change.field, change.before, action, t)}</span>
                  <span className="px-1.5 text-muted">→</span>
                  <span>{changeValue(change.field, change.after, action, t)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {action.kind === 'sleep' && action.overwrite && (
        <p className="mt-1 text-[11px] text-warning">{t('assistant.action.sleepOverwrite')}</p>
      )}
      {catalogUnavailable && (
        <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-fg">
          <p className="m-0">{catalogLoading ? t('assistant.action.previewLoading') : t('assistant.action.previewFailed')}</p>
          {catalogError && !catalogLoading && (
            <button
              type="button"
              onClick={onRetryCatalog}
              className="mt-1 inline-flex min-h-9 items-center text-xs text-brand hover:underline"
            >
              {t('assistant.retry')}
            </button>
          )}
        </div>
      )}
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}

      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveEdits}
            disabled={busy || !valid}
            className={`${SOLID_BUTTON} disabled:opacity-50`}
          >
            {t('assistant.edit.save')}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className={OUTLINE_BUTTON}
          >
            {t('assistant.edit.cancel')}
          </button>
        </div>
      ) : null}

      {state.status === 'pending' && !editing && (
        <>
          <p className="mt-1.5 text-[11px] text-muted">{t('assistant.action.note')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || catalogUnavailable}
              className={`${SOLID_BUTTON} disabled:opacity-50`}
            >
              <Icon name="check" />
              {t('assistant.action.confirm')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`${OUTLINE_BUTTON} disabled:opacity-50`}
            >
              {t('assistant.action.cancel')}
            </button>
            {canEdit && (
              <button
                type="button"
              onClick={openEdit}
                disabled={busy}
                className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50 md:min-h-0"
              >
                {t('assistant.edit.open')}
              </button>
            )}
          </div>
        </>
      )}

      {state.status === 'failed' && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || catalogUnavailable}
            className={`${OUTLINE_BUTTON} disabled:opacity-50`}
          >
            {t('assistant.retry')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-fg md:min-h-0"
          >
            {t('assistant.action.cancel')}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setDraft(draftOf(action))}
              disabled={busy}
              className="inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-brand disabled:opacity-50 md:min-h-0"
            >
              {t('assistant.edit.open')}
            </button>
          )}
        </div>
      )}

      {state.status === 'done' && (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="mt-2 inline-flex min-h-11 items-center text-[11px] text-muted transition-colors hover:text-danger disabled:opacity-50 md:min-h-0"
        >
          {t('assistant.action.undo')}
        </button>
      )}
    </div>
  )
}
