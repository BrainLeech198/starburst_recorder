import { describe, expect, it } from 'vitest'
import type { ChatMessageRecord } from './assistantChatStore'
import {
  getChatSessions,
  importChatSessions,
  normalizeChatSessions,
  resolvedActionNotes,
  updateChat,
} from './assistantChatStore'

function message(patch: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    at: 1,
    ...patch,
  }
}

const MEMORY = {
  action: { kind: 'memory' as const, text: '不吃香菜', memoryKind: 'preference' as const },
}

describe('助手卡片的处理结果', () => {
  it('拒绝、撤销和失败都要交给模型', () => {
    const notes = resolvedActionNotes([
      message({
        id: 'a',
        actions: [{ ...MEMORY, status: 'canceled' }],
      }),
      message({
        id: 'b',
        actions: [{ ...MEMORY, status: 'undone' }],
      }),
      message({
        id: 'c',
        actions: [{ ...MEMORY, status: 'failed', error: '网络断开' }],
      }),
    ])
    expect(notes).toHaveLength(3)
    expect(notes[0]).toContain('用户拒绝')
    expect(notes[1]).toContain('撤销')
    expect(notes[2]).toContain('网络断开')
  })

  it('已确认、待确认和空卡片不重复出现', () => {
    const notes = resolvedActionNotes([
      message({
        id: 'a',
        actions: [
          { ...MEMORY, status: 'done' },
          { ...MEMORY, status: 'pending' },
        ],
      }),
      message({ id: 'b' }),
    ])
    expect(notes).toEqual([])
  })
})

describe('备份里的对话校验', () => {
  it('空会话不占备份，正常会话保留', () => {
    const sessions = normalizeChatSessions([
      { id: 'empty', title: '', createdAt: 1, updatedAt: 1, messages: [] },
      {
        id: 'used',
        title: '午饭',
        createdAt: 1,
        updatedAt: 2,
        messages: [{ id: 'm1', role: 'user', content: '记一下午饭', at: 1 }],
      },
    ])
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('used')
  })

  it('融合按 id 取较新的一份，替换整组换掉', () => {
    updateChat(() => [{ id: 'local', role: 'user', content: '本机', at: 1 }])
    const other = (updatedAt: number, title: string) => ({
      id: 'other',
      title,
      createdAt: 1,
      updatedAt,
      messages: [{ id: 'm-other', role: 'user' as const, content: title, at: 1 }],
    })

    expect(importChatSessions([other(2, '备份')], 'merge')).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(importChatSessions([other(1, '旧备份')], 'merge')).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(importChatSessions([other(3, '新备份')], 'merge')).toEqual({ added: 0, updated: 1, skipped: 0 })
    expect(getChatSessions().find((item) => item.id === 'other')?.title).toBe('新备份')

    expect(importChatSessions([other(4, '只剩这段')], 'replace')).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(getChatSessions()).toHaveLength(1)
    expect(getChatSessions()[0].title).toBe('只剩这段')
  })
})
