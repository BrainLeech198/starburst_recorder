import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import { buildAssistantActionChanges, updateAssistantActionChanges } from './assistantActionChanges'
import type { AssistantAction } from './assistantActionBuild'

function emptyData(): BackupData {
  return {
    entries: [], stamps: [], days: [], presets: [], schedules: [], profile: null,
    foods: [], meals: [], intakes: [], sleeps: [], trainings: [], finance: [],
  }
}

describe('assistant action change preview', () => {
  it('captures only changed finance fields as before/after values', () => {
    const data = emptyData()
    data.finance.push({
      id: 'finance-1', code: 'f000001', dateKey: '2026-11-12', time: '12:00:00',
      kind: 'expense', category: 'food', name: '午餐', amount: 28, photo: null,
      note: '和同事', createdAt: 1, updatedAt: 1, deletedAt: null,
    })
    const action: AssistantAction = {
      kind: 'financeEdit', code: 'f000001', dateKey: '2026-11-12', amount: 32,
    }

    expect(buildAssistantActionChanges(action, data)).toEqual([
      { field: 'assistant.edit.amount', before: '28', after: '32' },
    ])
  })

  it('keeps full diary text in the durable preview', () => {
    const data = emptyData()
    data.entries.push({
      id: 'diary-1', code: 'd000001', dateKey: '2026-11-12', createdAt: 1,
      updatedAt: 1, content: '原来的内容', images: [], tags: [], deletedAt: null,
    })
    const action: AssistantAction = {
      kind: 'diaryEdit', code: 'd000001', dateKey: '2026-11-12', content: '整理后的内容',
    }

    expect(buildAssistantActionChanges(action, data)).toEqual([
      { field: 'assistant.edit.content', before: '原来的内容', after: '整理后的内容' },
    ])
  })

  it('updates the after value if the user edits the proposal in the card', () => {
    const changes = [{ field: 'assistant.edit.amount' as const, before: '28', after: '32' }]
    const next: AssistantAction = {
      kind: 'financeEdit', code: 'f000001', dateKey: '2026-11-12', amount: 35,
    }

    expect(updateAssistantActionChanges(changes, next)).toEqual([
      { field: 'assistant.edit.amount', before: '28', after: '35' },
    ])
  })
})
