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

export type EditFieldKind = 'text' | 'number' | 'time' | 'textarea'

export interface EditField {
  key: string
  label: MessageKey
  kind: EditFieldKind
  /** 新建类动作必须有值；改记录的字段留空表示「不改」 */
  required?: boolean
  step?: string
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
    draft[field.key] = value === undefined || value === null ? '' : String(value)
  }
  return draft
}

/** 填得对不对：数字必须是正数，必填项不能空 */
export function draftValid(fields: EditField[], draft: Record<string, string>): boolean {
  return fields.every((field) => {
    const raw = (draft[field.key] ?? '').trim()
    if (raw === '') return field.required !== true
    if (field.kind !== 'number') return true
    const value = Number(raw)
    return Number.isFinite(value) && value > 0
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
    default:
      return null
  }
}
