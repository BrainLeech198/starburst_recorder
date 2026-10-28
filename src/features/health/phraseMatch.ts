/**
 * 一句话解析结果与食物库的匹配。
 *
 * AI 也会给 matched，但那只是它的判断：最终以库里的名字为准，
 * 避免它编一个不存在的名字、或大小写空格不一致导致对不上。
 */
import type { HealthFood } from '@/core/db/schema'
import type { PhraseItem } from './mealPhrase'
import { normalizeFoodName } from './intakeDraft'

/** 库里同名多条时取第一条：列表里会带短编号，用户能看出是哪一条 */
export function matchFood(name: string, foods: HealthFood[]): HealthFood | null {
  const key = normalizeFoodName(name)
  if (key === '') return null
  return foods.find((food) => normalizeFoodName(food.name) === key) ?? null
}

export interface PhraseSplit {
  /** 命中食物库，可以直接记入，不用用户操心 */
  hits: PhraseItem[]
  /** 库里没有，逐条让用户决定新建还是跳过 */
  misses: PhraseItem[]
}

export function splitPhrase(items: PhraseItem[], foods: HealthFood[]): PhraseSplit {
  const hits: PhraseItem[] = []
  const misses: PhraseItem[] = []
  for (const item of items) {
    if (matchFood(item.name, foods)) hits.push(item)
    else misses.push(item)
  }
  return { hits, misses }
}
