/**
 * 分享类型 → 预览与导入实现的登记表。
 *
 * 新内容想支持分享（随记预设、训练计划、收支模板……）时，
 * 在 `shareCode.ts` 里加一个 kind，再往这里补一条适配器即可；
 * 分享弹窗和接收弹窗本身不用改。
 */
import type { Translate } from '@/shared/i18n/context'
import { importSharedDoc } from '@/features/health/foodShare'
import type { ShareDoc, ShareKind } from './shareCode'

export interface ShareAdapter {
  /** 接收前给用户看的几行摘要 */
  preview: (doc: ShareDoc, t: Translate) => string[]
  /** 真正写库，返回一句可以直接弹 toast 的话 */
  import: (doc: ShareDoc, t: Translate) => Promise<string>
}

const foodAdapter: ShareAdapter = {
  preview(doc, t) {
    if (doc.kind !== 'food') return []
    const data = doc.data
    const lines = [
      t('share.foodLine', {
        kcal: data.kcal,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
      }),
    ]
    if (data.servingName && data.servingGrams) {
      lines.push(`${data.servingName} · ${data.servingGrams} g`)
    }
    return lines
  },
  import: importSharedDoc,
}

const mealAdapter: ShareAdapter = {
  preview(doc, t) {
    if (doc.kind !== 'meal') return []
    const lines = [t('foods.mealItemCount', { n: doc.data.items.length })]
    for (const item of doc.data.items) {
      lines.push(t('share.mealLine', { name: item.food.name, grams: item.grams }))
    }
    return lines
  },
  import: importSharedDoc,
}

const ADAPTERS: Record<ShareKind, ShareAdapter> = {
  food: foodAdapter,
  meal: mealAdapter,
}

export function getShareAdapter(doc: ShareDoc): ShareAdapter {
  return ADAPTERS[doc.kind]
}
