/**
 * 「记一笔摄入」里的一条食物草稿。
 *
 * 单独拆出来是因为一句话解析的核对弹窗也要造同样的东西：
 * foodId 为空表示还没入库（AI 估的、或用户刚要新建的）。
 */
import type { HealthFood } from '@/core/db/schema'
import type { FoodDraft } from './FoodForm'

export interface DraftFood extends FoodDraft {
  /** 已入库的 id；null 表示这条还没落库 */
  foodId: string | null
}

export function asDraft(food: HealthFood): DraftFood {
  return {
    foodId: food.id,
    name: food.name,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    photo: food.photo,
  }
}

/** 名字比较的统一口径：去首尾空格、忽略大小写与中间空白 */
export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}
