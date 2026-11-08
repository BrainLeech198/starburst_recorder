/**
 * 套餐缩略图：套餐自己上传过封面就优先用它，
 * 没有才按成分顺序取第一张有照片的食物。
 *
 * 食物库、套餐选择器、套餐详情和摄入列表共用这一处，
 * 保证同一条套餐在哪儿看都是同一张图。
 */
import type { HealthFood, HealthMeal } from '@/core/db/schema'

function firstPhoto(
  ids: (string | null | undefined)[],
  foodById: ReadonlyMap<string, Pick<HealthFood, 'photo'>>,
): string | null {
  for (const id of ids) {
    if (!id) continue
    const photo = foodById.get(id)?.photo
    if (photo) return photo
  }
  return null
}

export function mealPhoto(meal: HealthMeal, foods: HealthFood[]): string | null {
  return mealPhotoFromMap(
    meal,
    new Map(foods.map((food) => [food.id, food] as const)),
  )
}

export function mealPhotoFromMap(
  meal: HealthMeal,
  foodById: ReadonlyMap<string, Pick<HealthFood, 'photo'>>,
): string | null {
  return (
    meal.photo ??
    firstPhoto(
      meal.items.map((item) => item.foodId),
      foodById,
    )
  )
}

/** 摄入里已经展开成成分快照的套餐，按 foodId 回食物库找图 */
export function componentPhoto(
  components: { foodId: string | null }[],
  foods: HealthFood[],
): string | null {
  return firstPhoto(
    components.map((component) => component.foodId),
    new Map(foods.map((food) => [food.id, food] as const)),
  )
}
