/**
 * 套餐缩略图：套餐本身不单独存封面，按成分顺序取第一张有照片的食物。
 *
 * 食物库、套餐选择器、套餐详情和摄入列表共用这一处，
 * 保证同一条套餐在哪儿看都是同一张图。
 */
import type { HealthFood, HealthMeal } from '@/core/db/schema'

function firstPhoto(ids: (string | null | undefined)[], foods: HealthFood[]): string | null {
  const photoById = new Map(foods.map((food) => [food.id, food.photo] as const))
  for (const id of ids) {
    if (!id) continue
    const photo = photoById.get(id)
    if (photo) return photo
  }
  return null
}

export function mealPhoto(meal: HealthMeal, foods: HealthFood[]): string | null {
  return firstPhoto(
    meal.items.map((item) => item.foodId),
    foods,
  )
}

/** 摄入里已经展开成成分快照的套餐，按 foodId 回食物库找图 */
export function componentPhoto(
  components: { foodId: string | null }[],
  foods: HealthFood[],
): string | null {
  return firstPhoto(
    components.map((component) => component.foodId),
    foods,
  )
}
