import { describe, expect, it } from 'vitest'
import { parseSuggestions, suggestKeys, summarizeSituation } from './assistantSuggest'
import type { HealthIntake, HealthSleep, FinanceEntry } from '@/core/db/schema'

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

describe('parseSuggestions', () => {
  it('剥掉编号、项目符号与引号，只留内容', () => {
    expect(parseSuggestions('1. “这周睡得好吗？”\n- 帮我看看今天的饮食\n• 明天该怎么安排')).toEqual([
      '这周睡得好吗？',
      '帮我看看今天的饮食',
      '明天该怎么安排',
    ])
  })

  it('丢掉代码围栏、空行和过短的垃圾行', () => {
    expect(parseSuggestions('```\n帮我记一笔早餐\n\n。\n你想聊点什么？\n```')).toEqual([
      '帮我记一笔早餐',
      '你想聊点什么？',
    ])
  })

  it('最多三条，重复的合并', () => {
    expect(
      parseSuggestions('A 问题\nA 问题\nB 问题\nC 问题\nD 问题'),
    ).toEqual(['A 问题', 'B 问题', 'C 问题'])
  })
})

describe('summarizeSituation', () => {
  it('没有任何记录时只给今天的日期', () => {
    expect(summarizeSituation({}, '2026-11-01')).toEqual(['Today: 2026-11-01'])
  })

  it('今天的摄入合计与跨零点的睡眠时长都算对', () => {
    const lines = summarizeSituation(
      {
        intakes: [
          { dateKey: '2026-11-01', kcal: 500, protein: 30, deletedAt: null },
          { dateKey: '2026-11-01', kcal: 300, protein: 20, deletedAt: null },
        ] as HealthIntake[],
        sleeps: [
          {
            dateKey: '2026-11-01',
            bedtime: '23:30',
            wakeTime: '07:00',
            quality: 4,
            deletedAt: null,
          },
        ] as HealthSleep[],
      },
      '2026-11-01',
    )
    expect(lines).toContain("Today's intake: 800 kcal, 50 g protein, 2 entries")
    expect(lines).toContain('Last night: 7.5 h, quality 4/5')
  })

  it('近 7 天的收支只算支出与收入，软删除的不算', () => {
    const rows = [
      { dateKey: '2026-10-30', kind: 'expense', amount: 120, deletedAt: null },
      { dateKey: '2026-11-01', kind: 'income', amount: 80, deletedAt: null },
      { dateKey: '2026-11-01', kind: 'expense', amount: 60, deletedAt: 123 },
      { dateKey: '2026-10-20', kind: 'expense', amount: 999, deletedAt: null },
    ] as FinanceEntry[]
    const lines = summarizeSituation({ finance: rows }, '2026-11-01')
    expect(lines).toContain('Last 7 days money: spent 120, income 80')
  })
})
