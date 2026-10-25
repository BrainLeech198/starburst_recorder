/**
 * 一句话解析结果与食物库的匹配。
 *
 * AI 也会给 matched，但那只是它的判断：最终以库里的名字为准，
 * 避免它编一个不存在的名字、或大小写空格不一致导致对不上。
 */
import type { HealthFood } from '@/core/db/schema'
import type { PhraseItem } from './mealPhrase'
import { normalizeFoodName } from './intakeDraft'
import type { FoodDraft } from './FoodForm'

/** 库里同名多条时取第一条：列表里会带短编号，用户能看出是哪一条 */
export function matchFood(name: string, foods: HealthFood[]): HealthFood | null {
  const key = normalizeFoodName(name)
  if (key === '') return null
  return foods.find((food) => normalizeFoodName(food.name) === key) ?? null
}

export interface PhraseMatch {
  item: PhraseItem
  food: HealthFood | null
}

export function matchPhrase(items: PhraseItem[], foods: HealthFood[]): PhraseMatch[] {
  return items.map((item) => ({ item, food: matchFood(item.name, foods) }))
}

/** 用户在核对窗里对某一项做的决定 */
export type PhraseDecision =
  | { kind: 'new'; draft: FoodDraft; grams: number }
  | { kind: 'skipped' }

export interface PhraseResolution {
  item: PhraseItem
  /** 这次吃了多少克 */
  grams: number
  /** 命中库里的那条；与 draft 二选一 */
  food: HealthFood | null
  /** 用户确认要新建的那份 */
  draft: FoodDraft | null
}

/**
 * 把「识别结果 + 用户决定」折成最终要记的项。
 *
 * 命中的不需要用户决定，直接用库里的数据；没决定过的算待确认，调用方据此禁用「完成」。
 */
export function resolvePhrase(
  items: PhraseItem[],
  matches: PhraseMatch[],
  decisions: Record<number, PhraseDecision>,
): { resolutions: PhraseResolution[]; pending: number } {
  const resolutions: PhraseResolution[] = []
  let pending = 0

  items.forEach((item, index) => {
    const food = matches[index]?.food ?? null
    if (food) {
      resolutions.push({
        item,
        grams: item.grams > 0 ? item.grams : 100,
        food,
        draft: null,
      })
      return
    }
    const decision = decisions[index]
    if (!decision) {
      pending += 1
      return
    }
    if (decision.kind === 'skipped') return
    resolutions.push({ item, grams: decision.grams, food: null, draft: decision.draft })
  })

  return { resolutions, pending }
}
