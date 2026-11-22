/**
 * 待确认卡片在写入前的「就地微调」。
 *
 * 为什么要有这一层：用户把「米饭 150 克」说成 250 克时，原先只能先写入、再让模型走一轮
 * update_*；中间那条错误记录会真进库，还得先查 [code]，多一轮请求也多个出错点。
 * 现在卡片本身可编辑，改的是待确认动作，不碰任何记录。
 *
 * 只放纯逻辑：字段声明、取值、校验。界面只负责把输入框画出来。
 * 日期、编号、覆盖标记一律不开放编辑——那些改错会写到别的记录上，不属于「微调」。
 */
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { AssistantAction } from './assistantActionBuild'

export type EditFieldKind = 'text' | 'number' | 'time' | 'textarea' | 'mealItems'

export interface EditField {
  key: string
  label: MessageKey
  kind: EditFieldKind
  /** 新建类动作必须有值；改记录的字段留空表示「不改」 */
  required?: boolean
  step?: string
  min?: number
  max?: number
  maxLength?: number
}

export function editFields(action: AssistantAction): EditField[] {
  switch (action.kind) {
    case 'finance':
      return [
        { key: 'name', label: 'assistant.edit.name', kind: 'text', required: true },
        { key: 'amount', label: 'assistant.edit.amount', kind: 'number', required: true, step: '0.01' },
      ]
    case 'financeEdit':
      return [
        { key: 'name', label: 'assistant.edit.name', kind: 'text' },
        { key: 'amount', label: 'assistant.edit.amount', kind: 'number', step: '0.01' },
      ]
    case 'intake':
      return [
        { key: 'name', label: 'assistant.edit.name', kind: 'text', required: true },
        { key: 'grams', label: 'assistant.edit.grams', kind: 'number', required: true },
        { key: 'kcal', label: 'assistant.edit.kcal', kind: 'number', required: true },
        { key: 'time', label: 'assistant.edit.time', kind: 'time' },
      ]
    case 'intakeEdit':
      return [
        { key: 'name', label: 'assistant.edit.name', kind: 'text' },
        { key: 'grams', label: 'assistant.edit.grams', kind: 'number' },
        { key: 'kcal', label: 'assistant.edit.kcal', kind: 'number' },
        { key: 'time', label: 'assistant.edit.time', kind: 'time' },
      ]
    case 'foodCreate':
      return [
        { key: 'name', label: 'foods.name', kind: 'text', required: true, maxLength: 60 },
        { key: 'kcal', label: 'foods.kcal', kind: 'number', required: true, step: '0.1', min: 0, max: 900 },
        { key: 'protein', label: 'foods.protein', kind: 'number', required: true, step: '0.1', min: 0, max: 100 },
        { key: 'carbs', label: 'foods.carbs', kind: 'number', required: true, step: '0.1', min: 0, max: 100 },
        { key: 'fat', label: 'foods.fat', kind: 'number', required: true, step: '0.1', min: 0, max: 100 },
        { key: 'servingName', label: 'foods.servingName', kind: 'text', maxLength: 40 },
        { key: 'servingGrams', label: 'foods.servingGrams', kind: 'number', step: '1', min: 1, max: 2000 },
      ]
    case 'foodEdit':
      return [
        { key: 'name', label: 'foods.name', kind: 'text', maxLength: 60 },
        { key: 'kcal', label: 'foods.kcal', kind: 'number', step: '0.1', min: 0, max: 900 },
        { key: 'protein', label: 'foods.protein', kind: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'carbs', label: 'foods.carbs', kind: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'fat', label: 'foods.fat', kind: 'number', step: '0.1', min: 0, max: 100 },
        { key: 'servingName', label: 'foods.servingName', kind: 'text', maxLength: 40 },
        { key: 'servingGrams', label: 'foods.servingGrams', kind: 'number', step: '1', min: 1, max: 2000 },
      ]
    case 'mealCreate':
      return [
        { key: 'name', label: 'foods.mealName', kind: 'text', required: true, maxLength: 60 },
        { key: 'items', label: 'foods.mealParts', kind: 'mealItems', required: true },
      ]
    case 'mealEdit':
      return [
        { key: 'name', label: 'foods.mealName', kind: 'text', maxLength: 60 },
        { key: 'items', label: 'foods.mealParts', kind: 'mealItems' },
      ]
    case 'weigh':
    case 'weighEdit':
      return [
        { key: 'weightKg', label: 'assistant.edit.weight', kind: 'number', required: true, step: '0.1' },
      ]
    case 'sleep':
      return [
        { key: 'bedtime', label: 'assistant.edit.bedtime', kind: 'time', required: true },
        { key: 'wakeTime', label: 'assistant.edit.wake', kind: 'time', required: true },
      ]
    case 'sleepEdit':
      return [
        { key: 'bedtime', label: 'assistant.edit.bedtime', kind: 'time' },
        { key: 'wakeTime', label: 'assistant.edit.wake', kind: 'time' },
      ]
    case 'diary':
    case 'diaryEdit':
      return [{ key: 'content', label: 'assistant.edit.content', kind: 'textarea', required: true }]
    case 'stamp':
      return [
        { key: 'time', label: 'assistant.edit.time', kind: 'time', required: true },
        { key: 'content', label: 'assistant.edit.content', kind: 'textarea', required: true },
      ]
    case 'stampEdit':
      return [
        { key: 'time', label: 'assistant.edit.time', kind: 'time' },
        { key: 'content', label: 'assistant.edit.content', kind: 'textarea' },
      ]
    case 'memory':
      return [{ key: 'text', label: 'assistant.edit.content', kind: 'textarea', required: true }]
    default:
      return []
  }
}

/** 卡片打开编辑时，把动作里的当前值摊成输入框的初值 */
export function draftOf(action: AssistantAction): Record<string, string> {
  const source = action as unknown as Record<string, unknown>
  const draft: Record<string, string> = {}
  for (const field of editFields(action)) {
    const value = source[field.key]
    draft[field.key] = value === undefined || value === null
      ? ''
      : field.kind === 'mealItems'
        ? JSON.stringify(value)
        : String(value)
  }
  return draft
}

/** 填得对不对：数字必须落在字段范围内，必填项不能空 */
export function draftValid(fields: EditField[], draft: Record<string, string>): boolean {
  return fields.every((field) => {
    const raw = (draft[field.key] ?? '').trim()
    if (raw === '') return field.required !== true
    if (field.kind === 'mealItems') {
      try {
        const items: unknown = JSON.parse(raw)
        return Array.isArray(items) && items.length > 0 && items.length <= 20 && items.every((item) =>
          Boolean(item && typeof item === 'object') &&
          typeof (item as Record<string, unknown>).foodId === 'string' &&
          (item as Record<string, string>).foodId.trim() !== '' &&
          typeof (item as Record<string, unknown>).grams === 'number' &&
          Number.isFinite((item as Record<string, number>).grams) &&
          Number.isInteger((item as Record<string, number>).grams) &&
          (item as Record<string, number>).grams > 0 &&
          (item as Record<string, number>).grams <= 5000,
        )
      } catch {
        return false
      }
    }
    if (field.kind !== 'number') return true
    const value = Number(raw)
    return Number.isFinite(value) &&
      (field.step !== '1' || Number.isInteger(value)) &&
      value >= (field.min ?? 0) && value <= (field.max ?? Number.POSITIVE_INFINITY)
  })
}

/**
 * 把改过的值写回动作。改记录类动作留空的字段表示「不改」，
 * 所以这里不把空串当成清空。
 * 返回 null 表示有字段不合法，调用方应当拒绝保存。
 */
export function applyEdits(
  action: AssistantAction,
  draft: Record<string, string>,
): AssistantAction | null {
  const text = (key: string) => (draft[key] ?? '').trim()
  const pickNumber = (key: string) => {
    const raw = text(key)
    if (raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const boundedNumber = (key: string, min: number, max: number, integer = false) => {
    const raw = text(key)
    if (raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && (!integer || Number.isInteger(value)) && value >= min && value <= max ? value : null
  }
  const mealItems = () => {
    const raw = text('items')
    if (raw === '') return undefined
    try {
      const items: unknown = JSON.parse(raw)
      if (!Array.isArray(items) || items.length === 0 || items.length > 20) return null
      const parsed = items.map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        if (typeof row.foodId !== 'string' || row.foodId.trim() === '') return null
        const grams = Number(row.grams)
        if (!Number.isFinite(grams) || !Number.isInteger(grams) || grams <= 0 || grams > 5000) return null
        return {
          foodId: row.foodId,
          name: typeof row.name === 'string' ? row.name : row.foodId,
          grams,
        }
      })
      if (parsed.some((item) => item === null)) return null
      return parsed.filter((item): item is NonNullable<typeof item> => item !== null)
    } catch {
      return null
    }
  }

  switch (action.kind) {
    case 'finance': {
      const amount = pickNumber('amount')
      if (amount === undefined || amount === null) return null
      return { ...action, name: text('name') || action.name, amount }
    }
    case 'financeEdit': {
      const next = { ...action }
      const name = text('name')
      if (name !== '') next.name = name
      const amount = pickNumber('amount')
      if (amount === null) return null
      if (amount !== undefined) next.amount = amount
      return next
    }
    case 'intake': {
      const name = text('name')
      const grams = pickNumber('grams')
      const kcal = pickNumber('kcal')
      if (name === '' || grams === undefined || grams === null) return null
      if (kcal === undefined || kcal === null) return null
      return { ...action, name, grams, kcal, time: text('time') || action.time }
    }
    case 'intakeEdit': {
      const next = { ...action }
      const name = text('name')
      if (name !== '') next.name = name
      const time = text('time')
      if (time !== '') next.time = time
      const grams = pickNumber('grams')
      if (grams === null) return null
      if (grams !== undefined) next.grams = grams
      const kcal = pickNumber('kcal')
      if (kcal === null) return null
      if (kcal !== undefined) next.kcal = kcal
      return next
    }
    case 'weigh':
    case 'weighEdit': {
      const weightKg = pickNumber('weightKg')
      if (weightKg === undefined || weightKg === null) return null
      return { ...action, weightKg }
    }
    case 'sleep': {
      const bedtime = text('bedtime')
      const wakeTime = text('wakeTime')
      if (bedtime === '' || wakeTime === '') return null
      return { ...action, bedtime, wakeTime }
    }
    case 'sleepEdit': {
      const next = { ...action }
      const bedtime = text('bedtime')
      if (bedtime !== '') next.bedtime = bedtime
      const wakeTime = text('wakeTime')
      if (wakeTime !== '') next.wakeTime = wakeTime
      return next
    }
    case 'diary':
    case 'diaryEdit': {
      const content = text('content')
      if (content === '') return null
      return { ...action, content }
    }
    case 'stamp': {
      const time = text('time')
      const content = text('content')
      if (time === '' || content === '') return null
      return { ...action, time, content }
    }
    case 'stampEdit': {
      const next = { ...action }
      const time = text('time')
      if (time !== '') next.time = time
      const content = text('content')
      if (content !== '') next.content = content
      return next
    }
    case 'memory': {
      const value = text('text')
      if (value === '') return null
      return { ...action, text: value }
    }
    case 'foodCreate': {
      const name = text('name').slice(0, 60)
      const kcal = boundedNumber('kcal', 0, 900)
      const protein = boundedNumber('protein', 0, 100)
      const carbs = boundedNumber('carbs', 0, 100)
      const fat = boundedNumber('fat', 0, 100)
      const servingGrams = boundedNumber('servingGrams', 1, 2000, true)
      if (name === '' || kcal === undefined || kcal === null || protein === undefined || protein === null ||
        carbs === undefined || carbs === null || fat === undefined || fat === null || servingGrams === null) return null
      return {
        ...action,
        name,
        kcal,
        protein,
        carbs,
        fat,
        servingName: text('servingName').slice(0, 40) || null,
        servingGrams: servingGrams ?? null,
      }
    }
    case 'foodEdit': {
      const next = { ...action }
      const name = text('name').slice(0, 60)
      if (name !== '') next.name = name
      for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
        const value = boundedNumber(key, 0, key === 'kcal' ? 900 : 100)
        if (value === null) return null
        if (value !== undefined) next[key] = value
      }
      const servingName = text('servingName').slice(0, 40)
      if (servingName !== '') next.servingName = servingName
      const servingGrams = boundedNumber('servingGrams', 1, 2000, true)
      if (servingGrams === null) return null
      if (servingGrams !== undefined) next.servingGrams = servingGrams
      return next
    }
    case 'mealCreate': {
      const name = text('name').slice(0, 60)
      const items = mealItems()
      if (name === '' || items === undefined || items === null) return null
      return { ...action, name, items }
    }
    case 'mealEdit': {
      const next = { ...action }
      const name = text('name').slice(0, 60)
      if (name !== '') next.name = name
      const items = mealItems()
      if (items === null) return null
      if (items !== undefined) next.items = items
      return next
    }
    default:
      return null
  }
}
