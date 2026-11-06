import { describe, expect, it } from 'vitest'
import { sortFoodCatalog } from './foodSort'

const items = [
  { name: '鸡腿', createdAt: 300 },
  { name: '米饭 10', createdAt: 100 },
  { name: '米饭 2', createdAt: 200 },
]

describe('sortFoodCatalog', () => {
  it('sorts names with Chinese locale and natural number order', () => {
    expect(sortFoodCatalog(items, 'name', 'asc').map((item) => item.name)).toEqual([
      '鸡腿',
      '米饭 2',
      '米饭 10',
    ])
  })

  it('sorts by original creation time in either direction', () => {
    expect(sortFoodCatalog(items, 'createdAt', 'asc').map((item) => item.name)).toEqual([
      '米饭 10',
      '米饭 2',
      '鸡腿',
    ])
    expect(sortFoodCatalog(items, 'createdAt', 'desc').map((item) => item.name)).toEqual([
      '鸡腿',
      '米饭 2',
      '米饭 10',
    ])
  })

  it('does not mutate the source list', () => {
    const source = [...items]
    sortFoodCatalog(source, 'name', 'desc')
    expect(source).toEqual(items)
  })
})
