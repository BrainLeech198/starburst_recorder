import { describe, expect, it } from 'vitest'
import { buildIntakeBundle } from './intakeBundle'

describe('buildIntakeBundle', () => {
  it('合并多种食物并保留各自的营养快照', () => {
    const result = buildIntakeBundle([
      {
        foodId: 'egg', name: '鸡蛋', grams: 50, source: 'library', mealId: null, components: [],
        macros: { kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
      },
      {
        foodId: 'rice', name: '米饭', grams: 150, source: 'library', mealId: null, components: [],
        macros: { kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
      },
    ])

    expect(result).toMatchObject({
      foodId: null,
      name: '鸡蛋 + 米饭',
      grams: 200,
      source: 'library',
      mealId: null,
      macros: { kcal: 246, protein: 10.2, carbs: 39.3, fat: 5.3 },
    })
    expect(result.components).toEqual([
      { foodId: 'egg', name: '鸡蛋', grams: 50, kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
      { foodId: 'rice', name: '米饭', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
    ])
  })

  it('单项普通食物不额外创建成分数组', () => {
    expect(buildIntakeBundle([{
      foodId: 'rice', name: '米饭', grams: 150, source: 'library', mealId: null, components: [],
      macros: { kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
    }])).toMatchObject({ foodId: 'rice', name: '米饭', grams: 150, components: null })
  })
})
