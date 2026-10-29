import { describe, expect, it } from 'vitest'
import type { HealthFood } from '@/core/db/schema'
import type { PhraseItem } from './mealPhrase'
import { matchFood, splitPhrase } from './phraseMatch'

function food(id: string, name: string): HealthFood {
  return {
    id,
    code: id,
    name,
    kcal: 100,
    protein: 10,
    carbs: 10,
    fat: 1,
    servingName: null,
    servingGrams: null,
    photo: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function item(name: string): PhraseItem {
  return { name, unit: '克', count: 100, grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, matched: '' }
}

describe('一句话结果与食物库匹配', () => {
  const foods = [food('1', '鸡胸肉'), food('2', 'Banana'), food('3', '香蕉'), food('4', '香蕉')]

  it('忽略大小写与空白', () => {
    expect(matchFood('banana', foods)?.id).toBe('2')
    expect(matchFood(' 鸡胸 肉 ', foods)?.id).toBe('1')
  })

  it('同名多条取第一条', () => {
    expect(matchFood('香蕉', foods)?.id).toBe('3')
  })

  it('空名字不匹配', () => {
    expect(matchFood('   ', foods)).toBeNull()
  })

  it('按命中与否拆成两拨，各自保持原顺序', () => {
    const { hits, misses } = splitPhrase(
      [item('香蕉'), item('烤南瓜'), item('BANANA'), item('藜麦')],
      foods,
    )
    expect(hits.map((entry) => entry.name)).toEqual(['香蕉', 'BANANA'])
    expect(misses.map((entry) => entry.name)).toEqual(['烤南瓜', '藜麦'])
  })
})
