import type { AssistantDataSource } from '@/core/db/store'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { findMemoryByText, type AssistantMemory } from './assistantMemory'
import type { AssistantAction } from './assistantActionBuild'

export interface AssistantActionChange {
  field: MessageKey
  before: string
  after: string
}

function shown(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.join('、') || '—'
  return String(value)
}

/** Capture a durable before/after preview from the same data snapshot used to build the action. */
export function buildAssistantActionChanges(
  action: AssistantAction,
  data: AssistantDataSource,
  memories: AssistantMemory[] = [],
): AssistantActionChange[] {
  const changes: AssistantActionChange[] = []
  const add = (field: MessageKey, before: unknown, after: unknown) => {
    if (after === undefined || Object.is(before, after)) return
    changes.push({ field, before: shown(before), after: shown(after) })
  }

  switch (action.kind) {
    case 'scheduleEdit': {
      const old = data.schedules.find((item) => item.code === action.code)
      if (!old) break
      add('schedule.fieldDate', old.dateKey, action.newDateKey)
      add('schedule.fieldTime', old.time, action.time)
      add('schedule.fieldTitle', old.title, action.newTitle)
      add('schedule.fieldNote', old.note, action.note)
      add('schedule.fieldRepeat', old.repeat, action.repeat)
      add('schedule.fieldWeeklyDays', old.weeklyDays, action.weeklyDays)
      add('schedule.fieldRemind', old.remind, action.remind)
      break
    }
    case 'diaryEdit': {
      const old = data.entries.find((item) => item.code === action.code)
      if (old) add('assistant.edit.content', old.content, action.content)
      break
    }
    case 'stampEdit': {
      const old = data.stamps.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.time', old.time, action.time)
      add('assistant.edit.content', old.content, action.content)
      break
    }
    case 'financeEdit': {
      const old = data.finance.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.name', old.name, action.name)
      add('assistant.edit.amount', old.amount, action.amount)
      add('assistant.change.direction', old.kind, action.direction)
      add('finance.category', old.category, action.category)
      add('schedule.fieldNote', old.note, action.note)
      break
    }
    case 'intakeEdit': {
      const old = data.intakes.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.time', old.time, action.time)
      add('assistant.edit.name', old.name, action.name)
      add('assistant.edit.grams', old.grams, action.grams)
      add('assistant.edit.kcal', old.kcal, action.kcal)
      add('assistant.change.protein', old.protein, action.protein)
      add('assistant.change.carbs', old.carbs, action.carbs)
      add('assistant.change.fat', old.fat, action.fat)
      break
    }
    case 'sleepEdit': {
      const old = data.sleeps.find((item) => item.dateKey === action.dateKey)
      if (!old) break
      add('assistant.edit.bedtime', old.bedtime, action.bedtime)
      add('assistant.edit.wake', old.wakeTime, action.wakeTime)
      add('assistant.change.quality', old.quality, action.quality)
      add('schedule.fieldNote', old.note, action.note)
      break
    }
    case 'weighEdit':
      add('assistant.edit.weight', action.previousKg, action.weightKg)
      break
    case 'foodEdit': {
      const old = data.foods.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.name', old.name, action.name)
      add('assistant.edit.kcal', old.kcal, action.kcal)
      add('assistant.change.protein', old.protein, action.protein)
      add('assistant.change.carbs', old.carbs, action.carbs)
      add('assistant.change.fat', old.fat, action.fat)
      add('assistant.change.servingName', old.servingName, action.servingName)
      add('assistant.change.servingGrams', old.servingGrams, action.servingGrams)
      break
    }
    case 'mealEdit': {
      const old = data.meals.find((item) => item.id === action.mealId)
      if (!old) break
      add('assistant.edit.name', old.name, action.name)
      if (action.items !== undefined) {
        const before = old.items.map((item) => {
          const food = data.foods.find((candidate) => candidate.id === item.foodId)
          return `${food?.name ?? item.foodId} ${item.grams}g`
        }).join('、')
        const after = action.items.map((item) => `${item.name} ${item.grams}g`).join('、')
        add('assistant.change.components', before, after)
      }
      break
    }
    case 'presetEdit': {
      const old = data.presets.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.name', old.name, action.name)
      add('assistant.change.kind', old.kind, action.presetKind)
      break
    }
    case 'profileEdit': {
      const old = data.profile
      if (!old) break
      add('profile.sex', old.sex, action.sex)
      add('profile.age', old.age, action.age)
      add('profile.height', old.heightCm, action.heightCm)
      add('assistant.edit.weight', old.weightKg, action.weightKg)
      add('profile.activity', old.activity, action.activity)
      add('profile.tdee', old.tdee, action.tdee)
      add('profile.target', old.targetKcal, action.targetKcal)
      add('profile.proteinTarget', old.proteinTarget, action.proteinTarget)
      add('health.idealBedtime', old.idealBedtime, action.idealBedtime)
      add('health.idealWake', old.idealWakeTime, action.idealWakeTime)
      add('profile.note', old.note, action.note)
      break
    }
    case 'trainingEdit': {
      const old = data.trainings.find((item) => item.code === action.code)
      if (!old) break
      add('assistant.edit.time', old.time, action.time)
      add('assistant.change.kind', old.kind, action.trainingKind)
      add('schedule.fieldTitle', old.title, action.title)
      add('training.durationMin', old.durationMin, action.durationMin)
      add('training.feeling', old.feeling, action.feeling)
      add('training.note', old.note, action.note)
      break
    }
    case 'weatherEdit': {
      const old = data.days.find((item) => item.dateKey === action.dateKey)
      add('assistant.change.weather', old?.weather, action.weather)
      break
    }
    case 'memoryEdit': {
      const old = findMemoryByText(memories, action.text)
      if (!old) break
      add('assistant.edit.content', old.text, action.newText)
      add('assistant.change.kind', old.kind, action.memoryKind)
      break
    }
    default:
      break
  }

  return changes
}

/** Keep the visible proposal synchronized when the user edits a card inline. */
export function updateAssistantActionChanges(
  changes: AssistantActionChange[],
  action: AssistantAction,
): AssistantActionChange[] {
  return changes.map((change) => {
    let value: unknown
    switch (action.kind) {
      case 'financeEdit':
        if (change.field === 'assistant.edit.name') value = action.name
        else if (change.field === 'assistant.edit.amount') value = action.amount
        else return change
        break
      case 'intakeEdit':
        if (change.field === 'assistant.edit.name') value = action.name
        else if (change.field === 'assistant.edit.grams') value = action.grams
        else if (change.field === 'assistant.edit.kcal') value = action.kcal
        else if (change.field === 'assistant.edit.time') value = action.time
        else return change
        break
      case 'weighEdit':
        if (change.field === 'assistant.edit.weight') value = action.weightKg
        else return change
        break
      case 'sleepEdit':
        if (change.field === 'assistant.edit.bedtime') value = action.bedtime
        else if (change.field === 'assistant.edit.wake') value = action.wakeTime
        else return change
        break
      case 'diaryEdit':
        if (change.field === 'assistant.edit.content') value = action.content
        else return change
        break
      case 'stampEdit':
        if (change.field === 'assistant.edit.time') value = action.time
        else if (change.field === 'assistant.edit.content') value = action.content
        else return change
        break
      default:
        return change
    }
    return { ...change, after: shown(value) }
  })
}
