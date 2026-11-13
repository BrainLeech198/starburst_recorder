import type { IntakeComponent } from '@/core/db/schema'
import { round2, sumMacros, type Macros } from './healthMath'

export interface IntakeBundleItem {
  foodId: string | null
  name: string
  grams: number
  source: 'library' | 'manual'
  mealId: string | null
  components: IntakeComponent[]
  macros: Macros
}

export interface IntakeBundle {
  foodId: string | null
  name: string
  grams: number
  source: 'library' | 'manual'
  mealId: string | null
  components: IntakeComponent[] | null
  macros: Macros
}

/** 将一次记录中的多项食物合成一条摄入，同时保留每项食物的营养快照。 */
export function buildIntakeBundle(items: IntakeBundleItem[]): IntakeBundle {
  const components = items.flatMap((item) =>
    item.components.length > 0
      ? item.components
      : [{ foodId: item.foodId, name: item.name, grams: item.grams, ...item.macros }],
  )
  const single = items.length === 1 ? items[0] : null

  return {
    foodId: single?.foodId ?? null,
    name: single?.name ?? items.map((item) => item.name).join(' + '),
    grams: round2(components.reduce((total, part) => total + part.grams, 0)),
    source: items.every((item) => item.source === 'library') ? 'library' : 'manual',
    mealId: single?.mealId ?? null,
    components: components.length > 1 || (single?.components.length ?? 0) > 0 ? components : null,
    macros: sumMacros(components),
  }
}
