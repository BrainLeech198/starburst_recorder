import { describe, expect, it } from 'vitest'
import type { HealthFood, HealthIntake } from './schema'
import { syncFoodIntakeSnapshot } from './syncFoodIntakeSnapshot'

const food: HealthFood = {
  id: 'rice',
  code: 'F000001',
  name: '熟米饭',
  tags: [],
  kcal: 140,
  protein: 3,
  carbs: 30,
  fat: 0.4,
  servingName: null,
  servingGrams: null,
  photo: null,
  createdAt: 100,
  updatedAt: 200,
  deletedAt: null,
}

const intake: HealthIntake = {
  id: 'intake-1',
  code: 'D000001',
  dateKey: '2026-11-11',
  time: '12:00',
  foodId: 'rice',
  name: '米饭',
  grams: 150,
  kcal: 174,
  protein: 3.9,
  carbs: 38.9,
  fat: 0.5,
  source: 'library',
  createdAt: 300,
  updatedAt: 300,
  deletedAt: null,
}

describe('syncFoodIntakeSnapshot', () => {
  it('用食物库新营养按历史摄入克数更新快照', () => {
    expect(syncFoodIntakeSnapshot(intake, food, 400)).toMatchObject({
      name: '熟米饭',
      grams: 150,
      kcal: 210,
      protein: 4.5,
      carbs: 45,
      fat: 0.6,
      updatedAt: 400,
    })
  })

  it('套餐历史快照只重算对应成分并重算总营养', () => {
    const mealIntake: HealthIntake = {
      ...intake,
      foodId: null,
      name: '米饭套餐',
      grams: 250,
      kcal: 274,
      protein: 8.9,
      carbs: 58.9,
      fat: 5.5,
      components: [
        { foodId: 'rice', name: '米饭', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
        { foodId: 'egg', name: '鸡蛋', grams: 100, kcal: 100, protein: 5, carbs: 20, fat: 5 },
      ],
    }

    expect(syncFoodIntakeSnapshot(mealIntake, food, 400)).toMatchObject({
      name: '米饭套餐',
      grams: 250,
      kcal: 310,
      protein: 9.5,
      carbs: 65,
      fat: 5.6,
      components: [
        { foodId: 'rice', name: '熟米饭', grams: 150, kcal: 210, protein: 4.5, carbs: 45, fat: 0.6 },
        { foodId: 'egg', name: '鸡蛋', grams: 100, kcal: 100, protein: 5, carbs: 20, fat: 5 },
      ],
    })
  })

  it('不匹配该食物的摄入保持原样', () => {
    expect(syncFoodIntakeSnapshot({ ...intake, foodId: null }, food, 400)).toBeNull()
  })
})
