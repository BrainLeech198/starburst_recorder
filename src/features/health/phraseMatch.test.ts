import { describe, expect, it } from 'vitest'
import type { HealthFood } from '@/core/db/schema'
import type { PhraseItem } from './mealPhrase'
import { matchFood, matchPhrase, resolvePhrase } from './phraseMatch'
import type { FoodDraft } from './FoodForm'

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

  it('没命中返回 null，逐项结果保持原顺序', () => {
    const result = matchPhrase([item('香蕉'), item('不存在'), item('BANANA')], foods)
    expect(result.map((entry) => entry.food?.id ?? null)).toEqual(['3', null, '2'])
  })
})

describe('核对结果折算', () => {
  const foods = [food('1', '鸡胸肉')]
  const draft: FoodDraft = {
    name: '烤南瓜',
    kcal: 40,
    protein: 1,
    carbs: 9,
    fat: 0.2,
    servingName: null,
    servingGrams: null,
  }

  it('命中的自动带上库里的数据，克数缺失按 100 算', () => {
    const items = [{ ...item('鸡胸肉'), grams: 0 }]
    const { resolutions, pending } = resolvePhrase(items, matchPhrase(items, foods), {})
    expect(pending).toBe(0)
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].food?.id).toBe('1')
    expect(resolutions[0].grams).toBe(100)
  })

  it('没决定过的算待确认，不产出条目', () => {
    const items = [item('烤南瓜')]
    const { resolutions, pending } = resolvePhrase(items, matchPhrase(items, foods), {})
    expect(pending).toBe(1)
    expect(resolutions).toHaveLength(0)
  })

  it('跳过的不记；新建的按用户改过的克数记', () => {
    const items = [item('烤南瓜'), item('藜麦')]
    const matches = matchPhrase(items, foods)
    const { resolutions, pending } = resolvePhrase(items, matches, {
      0: { kind: 'skipped' },
      1: { kind: 'new', draft, grams: 120 },
    })
    expect(pending).toBe(0)
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].item.name).toBe('藜麦')
    expect(resolutions[0].grams).toBe(120)
    expect(resolutions[0].draft?.name).toBe('烤南瓜')
  })

  it('保持原话顺序', () => {
    const items = [item('香蕉'), item('烤南瓜'), item('鸡胸肉')]
    const matches = matchPhrase(items, [...foods, food('3', '香蕉')])
    const { resolutions } = resolvePhrase(items, matches, {
      1: { kind: 'new', draft, grams: 150 },
    })
    expect(resolutions.map((entry) => entry.item.name)).toEqual(['香蕉', '烤南瓜', '鸡胸肉'])
  })
})
