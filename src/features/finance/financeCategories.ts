/**
 * 内置收支分类。
 *
 * 分类在库里只存一个字符串 id，内置和以后的自定义分类共用这个字段；
 * 这里只管内置的那批，标签走 i18n，页面通过 `categoryKey` 取。
 */
import type { FinanceKind } from '@/core/db/schema'
import { MESSAGES } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export interface FinanceCategory {
  id: string
  kind: FinanceKind
  label: MessageKey
}

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'food', kind: 'expense', label: 'finance.cat.food' },
  { id: 'groceries', kind: 'expense', label: 'finance.cat.groceries' },
  { id: 'transport', kind: 'expense', label: 'finance.cat.transport' },
  { id: 'vehicle', kind: 'expense', label: 'finance.cat.vehicle' },
  { id: 'shopping', kind: 'expense', label: 'finance.cat.shopping' },
  { id: 'clothing', kind: 'expense', label: 'finance.cat.clothing' },
  { id: 'home', kind: 'expense', label: 'finance.cat.home' },
  { id: 'housing', kind: 'expense', label: 'finance.cat.housing' },
  { id: 'utilities', kind: 'expense', label: 'finance.cat.utilities' },
  { id: 'health', kind: 'expense', label: 'finance.cat.health' },
  { id: 'fun', kind: 'expense', label: 'finance.cat.fun' },
  { id: 'travel', kind: 'expense', label: 'finance.cat.travel' },
  { id: 'study', kind: 'expense', label: 'finance.cat.study' },
  { id: 'books', kind: 'expense', label: 'finance.cat.books' },
  { id: 'social', kind: 'expense', label: 'finance.cat.social' },
  { id: 'pets', kind: 'expense', label: 'finance.cat.pets' },
  { id: 'digital', kind: 'expense', label: 'finance.cat.digital' },
  { id: 'network', kind: 'expense', label: 'finance.cat.network' },
  { id: 'subscription', kind: 'expense', label: 'finance.cat.subscription' },
  { id: 'other', kind: 'expense', label: 'finance.cat.other' },
  { id: 'salary', kind: 'income', label: 'finance.cat.salary' },
  { id: 'bonus', kind: 'income', label: 'finance.cat.bonus' },
  { id: 'invest', kind: 'income', label: 'finance.cat.invest' },
  { id: 'gift', kind: 'income', label: 'finance.cat.gift' },
  { id: 'sideIncome', kind: 'income', label: 'finance.cat.sideIncome' },
  { id: 'reimbursement', kind: 'income', label: 'finance.cat.reimbursement' },
  { id: 'refund', kind: 'income', label: 'finance.cat.refund' },
  { id: 'allowance', kind: 'income', label: 'finance.cat.allowance' },
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

/** 一个文案 key 在全部语言里的写法，去重 */
function labelsInAllLocales(key: MessageKey): string[] {
  return [...new Set(Object.values(MESSAGES).map((table) => table[key]).filter(Boolean))]
}

/**
 * 关键词对上的分类 id，给全局搜索用。
 *
 * 库里只存 id，界面上看到的是各语言的译名，所以搜索也不能拿 id 比字符串：
 * 把九种语言的译名都过一遍，切哪种界面语言搜「餐饮 / Food / 食事」都是同一批记录。
 * 反过来说，直接敲 `food` 这种库里的 id 是搜不到的，那不该是用户要记的东西。
 */
export function categoryIdsFor(keyword: string): string[] {
  const needle = keyword.trim().toLowerCase()
  if (needle === '' || needle.startsWith('#')) return []
  return FINANCE_CATEGORIES.filter((item) =>
    labelsInAllLocales(item.label).some((label) => label.toLowerCase().includes(needle)),
  ).map((item) => item.id)
}
