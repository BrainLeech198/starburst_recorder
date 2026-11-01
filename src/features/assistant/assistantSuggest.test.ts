import { describe, expect, it } from 'vitest'
import { suggestKeys } from './assistantSuggest'

describe('suggestKeys', () => {
  it('按话题挑推荐问：谈到体重就先给体重', () => {
    expect(suggestKeys('最近七天体重从 68.4 降到 67.9 公斤。')[0]).toBe('assistant.suggest.weight')
  })

  it('谈到钱给消费相关', () => {
    expect(suggestKeys('这个月一共花了 3200 元，餐饮占一半。')[0]).toBe(
      'assistant.suggest.finance',
    )
  })

  it('谈到睡眠或日记也能对应上', () => {
    expect(suggestKeys('这周平均睡了 6 小时 40 分。')[0]).toBe('assistant.suggest.sleep')
    expect(suggestKeys('日记里你提到最近有点焦虑。')[0]).toBe('assistant.suggest.mood')
  })

  it('什么话题都没有时给通用三条', () => {
    const keys = suggestKeys('好的，还有什么想问的吗？')
    expect(keys).toHaveLength(3)
    expect(keys[0]).toBe('assistant.suggest.summary')
  })

  it('没有回答内容时也是通用三条，且不重复', () => {
    const keys = suggestKeys('   ')
    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(3)
  })
})
