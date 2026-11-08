import { describe, expect, it } from 'vitest'
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import { componentPhoto, mealPhoto, mealPhotoFromMap } from './mealPhoto'

const T = 100

function food(id: string, photo: string | null): HealthFood {
  return {
    id,
    code: id.padEnd(7, '0'),
    name: id,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    servingName: null,
    servingGrams: null,
    photo,
    tags: [],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  }
}

function meal(photo: string | null, foodIds: string[]): HealthMeal {
  return {
    id: 'm1',
    name: '鸡腿饭',
    photo,
    items: foodIds.map((foodId) => ({ foodId, grams: 100 })),
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  }
}

describe('mealPhoto', () => {
  it('套餐自己的封面优先于成分照片', () => {
    const foods = [food('f1', 'food-photo')]
    expect(mealPhoto(meal('meal-photo', ['f1']), foods)).toBe('meal-photo')
  })

  it('没有自己的封面时，按成分顺序取第一张', () => {
    const foods = [food('f1', null), food('f2', 'second'), food('f3', 'third')]
    expect(mealPhoto(meal(null, ['f1', 'f2', 'f3']), foods)).toBe('second')
    expect(
      mealPhotoFromMap(
        meal(null, ['f1', 'f2', 'f3']),
        new Map(foods.map((item) => [item.id, item])),
      ),
    ).toBe('second')
    expect(componentPhoto([{ foodId: 'f1' }, { foodId: 'f3' }], foods)).toBe('third')
  })

  it('成分被删光后返回 null', () => {
    expect(mealPhoto(meal(null, ['missing']), [])).toBeNull()
  })
})
