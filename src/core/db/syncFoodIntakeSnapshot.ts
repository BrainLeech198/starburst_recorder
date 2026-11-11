import type { HealthFood, HealthIntake, IntakeComponent } from './schema'

/** 按食物库当前营养与原克数，更新一笔摄入里的历史快照。 */
export function syncFoodIntakeSnapshot(
  intake: HealthIntake,
  food: HealthFood,
  updatedAt: number,
): HealthIntake | null {
  const hasDirectFood = intake.foodId === food.id
  const components = intake.components ?? []
  const hasFoodComponent = components.some((part) => part.foodId === food.id)
  if (!hasDirectFood && !hasFoodComponent) return null

  let next: HealthIntake = intake
  if (hasFoodComponent) {
    const nextComponents = components.map((part) =>
      part.foodId === food.id ? recalculateComponent(part, food) : part,
    )
    next = {
      ...next,
      components: nextComponents,
      ...sumComponents(nextComponents),
      updatedAt,
    }
  }

  if (hasDirectFood) {
    next = {
      ...next,
      name: food.name,
      ...(components.length === 0 ? macrosFor(food, intake.grams) : {}),
      updatedAt,
    }
  }
  return next
}

function macrosFor(food: HealthFood, grams: number) {
  const ratio = Math.max(0, Number(grams) || 0) / 100
  return {
    kcal: Math.round(food.kcal * ratio),
    protein: round1(food.protein * ratio),
    carbs: round1(food.carbs * ratio),
    fat: round1(food.fat * ratio),
  }
}

function recalculateComponent(part: IntakeComponent, food: HealthFood): IntakeComponent {
  return { ...part, name: food.name, ...macrosFor(food, part.grams) }
}

function sumComponents(components: IntakeComponent[]) {
  return components.reduce(
    (total, part) => ({
      kcal: total.kcal + part.kcal,
      protein: round1(total.protein + part.protein),
      carbs: round1(total.carbs + part.carbs),
      fat: round1(total.fat + part.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}
