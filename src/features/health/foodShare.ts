/**
 * 食物 / 套餐的分享适配器。
 *
 * 食物直接带整份配置（照片原样带上）；套餐只存「食物 id + 克数」，
 * 所以分享时要把每项食物展开成完整配置，接收端再按名称重新映射到本地 id。
 * 同名食物一律复用，不覆盖对方的营养数据；套餐重名时自动加序号。
 */
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import type { Translate } from '@/shared/i18n/context'
import { SHARE_APP, SHARE_VERSION } from '@/features/share/shareCode'
import type {
  ShareDoc,
  ShareFoodConfig,
  ShareFoodDoc,
  ShareMealDoc,
} from '@/features/share/shareCode'
import { healthFoods, healthMeals, saveHealthFood, saveHealthMeal } from './healthRepo'

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function toShareFood(food: HealthFood): ShareFoodConfig {
  return {
    name: food.name,
    code: food.code,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    photo: food.photo,
  }
}

export function buildFoodShare(food: HealthFood): ShareFoodDoc {
  return {
    app: SHARE_APP,
    v: SHARE_VERSION,
    kind: 'food',
    title: food.name,
    createdAt: Date.now(),
    data: toShareFood(food),
  }
}

/** 套餐分享：只带还在食物库里的成分；一项都没有时返回 null，界面会提示 */
export function buildMealShare(meal: HealthMeal, foods: HealthFood[]): ShareMealDoc | null {
  const byId = new Map(foods.map((food) => [food.id, food]))
  const items = meal.items.flatMap((item) => {
    const food = byId.get(item.foodId)
    return food ? [{ food: toShareFood(food), grams: item.grams }] : []
  })
  if (items.length === 0) return null
  return {
    app: SHARE_APP,
    v: SHARE_VERSION,
    kind: 'meal',
    title: meal.name,
    createdAt: Date.now(),
    data: { name: meal.name, items },
  }
}

async function createFood(config: ShareFoodConfig): Promise<HealthFood> {
  const now = Date.now()
  const food: HealthFood = {
    id: newId(),
    code: newCode(),
    name: config.name,
    kcal: config.kcal,
    protein: config.protein,
    carbs: config.carbs,
    fat: config.fat,
    servingName: config.servingName,
    servingGrams: config.servingGrams,
    photo: config.photo,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await saveHealthFood(food)
  return food
}

async function importSharedFood(doc: ShareFoodDoc, t: Translate): Promise<string> {
  const existing = await healthFoods()
  const same = existing.find((food) => sameName(food.name, doc.data.name))
  if (same) return t('share.foodReused', { name: same.name })
  const created = await createFood(doc.data)
  return t('share.foodImported', { name: created.name })
}

/** 同名套餐加序号，和「复制一份」的命名习惯一致 */
function uniqueMealName(base: string, meals: HealthMeal[]): string {
  if (!meals.some((meal) => sameName(meal.name, base))) return base
  let index = 2
  while (meals.some((meal) => sameName(meal.name, `${base} ${index}`))) index += 1
  return `${base} ${index}`
}

async function importSharedMeal(doc: ShareMealDoc, t: Translate): Promise<string> {
  const existingFoods = await healthFoods()
  const byName = new Map<string, HealthFood>()
  for (const food of existingFoods) byName.set(food.name.trim().toLowerCase(), food)

  const items: HealthMeal['items'] = []
  for (const item of doc.data.items) {
    const key = item.food.name.trim().toLowerCase()
    let food = byName.get(key)
    if (!food) {
      food = await createFood(item.food)
      byName.set(key, food)
    }
    items.push({ foodId: food.id, grams: item.grams })
  }

  const meals = await healthMeals()
  const name = uniqueMealName(doc.data.name, meals)
  const now = Date.now()
  await saveHealthMeal({
    id: newId(),
    name,
    items,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
  return t('share.mealImported', { name })
}

export function importSharedDoc(doc: ShareDoc, t: Translate): Promise<string> {
  return doc.kind === 'food' ? importSharedFood(doc, t) : importSharedMeal(doc, t)
}
