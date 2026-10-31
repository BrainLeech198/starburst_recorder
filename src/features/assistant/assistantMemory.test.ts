import { describe, expect, it } from 'vitest'
import { MAX_MEMORY_TEXT, MAX_MEMORIES, normalizeMemories } from './assistantMemory'

describe('normalizeMemories', () => {
  it('只收有分类的合法条目，缺 id 的现场补一个', () => {
    const list = normalizeMemories([
      { kind: 'preference', text: '不吃香菜' },
      { kind: 'nope', text: '坏分类' },
      { kind: 'goal', text: '   ' },
      'not an object',
    ])
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('不吃香菜')
    expect(list[0].kind).toBe('preference')
    expect(list[0].id).not.toBe('')
  })

  it('同一句话只留最早的一条', () => {
    const list = normalizeMemories([
      { kind: 'fact', text: '养了一只猫' },
      { kind: 'habit', text: '养了一只猫' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].kind).toBe('fact')
  })

  it('超长文字截断，条数封顶', () => {
    const long = 'x'.repeat(MAX_MEMORY_TEXT + 50)
    const list = normalizeMemories([
      { kind: 'fact', text: long },
      ...Array.from({ length: MAX_MEMORIES + 20 }, (_, index) => ({
        kind: 'fact',
        text: `第 ${index} 条`,
      })),
    ])
    expect(list[0].text).toHaveLength(MAX_MEMORY_TEXT)
    expect(list).toHaveLength(MAX_MEMORIES)
  })

  it('不是数组时返回空', () => {
    expect(normalizeMemories(null)).toEqual([])
    expect(normalizeMemories({})).toEqual([])
  })
})
