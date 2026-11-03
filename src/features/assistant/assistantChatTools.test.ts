import { describe, expect, it } from 'vitest'
import type { ChatMessageRecord } from './assistantChatStore'
import {
  appendChatVariant,
  beginChatRegeneration,
  deleteChatFrom,
  deleteChatMessages,
  forkChatSession,
  getChatMessages,
  getChatSessions,
  getCurrentSessionId,
  switchChatVariant,
  updateChat,
} from './assistantChatStore'

function message(patch: Partial<ChatMessageRecord>): ChatMessageRecord {
  return { id: 'm1', role: 'user', content: '', at: 1, ...patch }
}

function reset(messages: ChatMessageRecord[]) {
  updateChat(() => messages)
}

describe('回答版本', () => {
  it('重新生成把旧回答留成第一版，可以左右切回', () => {
    reset([message({ id: 'a', role: 'assistant', content: '第一版' })])

    beginChatRegeneration('a')
    expect(getChatMessages()[0].content).toBe('')

    appendChatVariant('a', { content: '第二版', at: 2 })
    const updated = getChatMessages()[0]
    expect(updated.content).toBe('第二版')
    expect(updated.variants?.map((item) => item.content)).toEqual(['第一版', '第二版'])
    expect(updated.variantIndex).toBe(1)

    switchChatVariant('a', -1)
    expect(getChatMessages()[0].content).toBe('第一版')
    switchChatVariant('a', 1)
    expect(getChatMessages()[0].content).toBe('第二版')
  })
})

describe('分支与删除', () => {
  it('编辑用户消息会开新分支，原会话一条都不少', () => {
    reset([
      message({ id: 'u0', content: '开场' }),
      message({ id: 'u1', content: '原始问题' }),
      message({ id: 'a1', role: 'assistant', content: '旧回答' }),
    ])
    const sourceId = getCurrentSessionId()
    const sourceCount = getChatSessions().length

    const forkedId = forkChatSession(1, { content: '改写的问题' })
    expect(forkedId).not.toBeNull()
    expect(getCurrentSessionId()).toBe(forkedId)
    expect(getChatMessages().map((item) => item.content)).toEqual(['开场', '改写的问题'])
    expect(getChatSessions().length).toBe(sourceCount + 1)

    const source = getChatSessions().find((item) => item.id === sourceId)
    expect(source?.messages).toHaveLength(3)
    expect(source?.messages[1].content).toBe('原始问题')
    expect(source?.messages[2].content).toBe('旧回答')

    const forked = getChatSessions().find((item) => item.id === forkedId)
    expect(forked?.forkFrom).toBe(sourceId)
    expect(forked?.forkGroup).toBe(sourceId)
  })

  it('删除这条及之后只留前面的消息', () => {
    reset([
      message({ id: 'a', content: '一' }),
      message({ id: 'b', content: '二' }),
      message({ id: 'c', content: '三' }),
    ])
    expect(deleteChatFrom('b')).toBe(2)
    expect(getChatMessages().map((item) => item.content)).toEqual(['一'])
  })

  it('多选删除只删点中的消息', () => {
    reset([
      message({ id: 'a', content: '一' }),
      message({ id: 'b', content: '二' }),
      message({ id: 'c', content: '三' }),
    ])
    deleteChatMessages(['a', 'c'])
    expect(getChatMessages().map((item) => item.content)).toEqual(['二'])
  })
})
