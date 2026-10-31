/**
 * 内置收支分类。
 *
 * 分类在库里只存一个字符串 id，内置和以后的自定义分类共用这个字段；
 * 这里只管内置的那批，标签走 i18n，页面通过 `categoryKey` 取。
 */
import type { FinanceKind } from '@/core/db/schema'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export interface FinanceCategory {
  id: string
  kind: FinanceKind
  label: MessageKey
}

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'food', kind: 'expense', label: 'finance.cat.food' },
  { id: 'transport', kind: 'expense', label: 'finance.cat.transport' },
  { id: 'shopping', kind: 'expense', label: 'finance.cat.shopping' },
  { id: 'home', kind: 'expense', label: 'finance.cat.home' },
  { id: 'health', kind: 'expense', label: 'finance.cat.health' },
  { id: 'fun', kind: 'expense', label: 'finance.cat.fun' },
  { id: 'study', kind: 'expense', label: 'finance.cat.study' },
  { id: 'social', kind: 'expense', label: 'finance.cat.social' },
  { id: 'other', kind: 'expense', label: 'finance.cat.other' },
  { id: 'salary', kind: 'income', label: 'finance.cat.salary' },
  { id: 'bonus', kind: 'income', label: 'finance.cat.bonus' },
  { id: 'invest', kind: 'income', label: 'finance.cat.invest' },
  { id: 'gift', kind: 'income', label: 'finance.cat.gift' },
  { id: 'otherIncome', kind: 'income', label: 'finance.cat.otherIncome' },
]

/** 某一方向下可选的分类 */
export function categoriesOf(kind: FinanceKind): FinanceCategory[] {
  return FINANCE_CATEGORIES.filter((item) => item.kind === kind)
}

/** 分类 id → i18n key；空串或不认识的 id 都退回「未分类」 */
export function categoryKey(id: string): MessageKey {
  return FINANCE_CATEGORIES.find((item) => item.id === id)?.label ?? 'finance.uncategorized'
}
