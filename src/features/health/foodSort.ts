export type FoodSortKey = 'name' | 'createdAt'
export type FoodSortDirection = 'asc' | 'desc'

type SortableCatalogItem = { name: string; createdAt: number }

function compareName(a: string, b: string): number {
  return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

/** Copy and sort foods or meals by their name or original library creation time. */
export function sortFoodCatalog<T extends SortableCatalogItem>(
  items: readonly T[],
  key: FoodSortKey,
  direction: FoodSortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const primary = key === 'name' ? compareName(a.name, b.name) : a.createdAt - b.createdAt
    const tieBreak = key === 'createdAt' ? compareName(a.name, b.name) : 0
    return sign * (primary || tieBreak)
  })
}
