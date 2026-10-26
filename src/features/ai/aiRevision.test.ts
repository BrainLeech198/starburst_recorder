import { describe, expect, it } from 'vitest'
import { buildRevisionMessages } from './aiRevision'
import type { RevisionSeed } from './aiRevision'

const seed: RevisionSeed & {
  draft: string
  turns: { request: string; content: string }[]
  request: string
} = {
  systemPrompt: '原始规矩',
  seedUser: '今天九点排队，十点吃饭。',
  draft: '第一版正文。',
  turns: [],
  request: '第二段再短一点',
}

describe('AI 改稿：消息拼装', () => {
  it('第一次提要求：原规矩 + 素材 + 当前草稿 + 用户要求', () => {
    const messages = buildRevisionMessages(seed)

    expect(messages).toHaveLength(4)
    expect(messages[0].role).toBe('system')
    expect(String(messages[0].content)).toContain('原始规矩')
    // 改稿的硬性要求写在 system 里，用户的话保持原样
    expect(String(messages[0].content)).toContain('完整')
    expect(messages[1]).toEqual({ role: 'user', content: seed.seedUser })
    expect(messages[2]).toEqual({ role: 'assistant', content: seed.draft })
    expect(messages[3]).toEqual({ role: 'user', content: seed.request })
  })

  it('多轮时带上之前每一轮的要求与结果，当前草稿不再重复成一条 assistant', () => {
    const messages = buildRevisionMessages({
      ...seed,
      draft: '第二版正文。',
      turns: [
        { request: '更口语', content: '第一点五版。' },
        { request: '去掉最后一句', content: '第二版正文。' },
      ],
      request: '再收短一点',
    })

    expect(messages.map((item) => item.role)).toEqual([
      'system',
      'user',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ])
    expect(messages[3]).toEqual({ role: 'assistant', content: '第一点五版。' })
    expect(messages[6]).toEqual({ role: 'user', content: '再收短一点' })
  })

  it('用户手改过当前草稿时，把最新正文说明白再提要求', () => {
    const messages = buildRevisionMessages({
      ...seed,
      draft: '我手动改过的正文。',
      turns: [{ request: '更口语', content: 'AI 上一版。' }],
      request: '照这个再润一下',
    })

    const before = messages[messages.length - 2]
    const last = messages[messages.length - 1]
    expect(before.role).toBe('user')
    expect(String(before.content)).toContain('我手动改过的正文。')
    expect(last).toEqual({ role: 'user', content: '照这个再润一下' })
  })

  it('要求前后的空白去掉；要求是空白时不追加空消息', () => {
    const trimmed = buildRevisionMessages({ ...seed, request: '  短一点  ' })
    expect(trimmed[trimmed.length - 1]).toEqual({ role: 'user', content: '短一点' })

    const blank = buildRevisionMessages({ ...seed, request: '   ' })
    expect(blank[blank.length - 1].role).toBe('assistant')
  })
})
