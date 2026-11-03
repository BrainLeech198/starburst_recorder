/**
 * 分享类型 → 预览与导入实现的登记表。
 *
 * 新内容想支持分享（随记预设、训练计划、收支模板……）时，
 * 在 `shareCode.ts` 里加一个 kind，再往这里补一条适配器即可；
 * 分享弹窗和接收弹窗本身不用改。
 */
import type { Translate } from '@/shared/i18n/context'
import { importSharedDoc } from '@/features/health/foodShare'
import { importSharedDiary, importSharedFinance, importSharedIntake, importSharedStamp } from './recordShare'
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

const diaryAdapter: ShareAdapter = {
  preview: (doc, t) => doc.kind === 'diary' ? [t('share.recordPreview', { date: doc.data.dateKey, detail: doc.data.content.slice(0, 100) })] : [],
  import: async (doc, t) => {
    if (doc.kind !== 'diary') throw new Error('invalid diary share')
    await importSharedDiary(doc)
    return t('share.recordImported', { title: doc.title })
  },
}
const stampAdapter: ShareAdapter = {
  preview: (doc, t) => doc.kind === 'stamp' ? [t('share.recordPreview', { date: `${doc.data.dateKey} ${doc.data.time}`, detail: doc.data.content.slice(0, 100) })] : [],
  import: async (doc, t) => {
    if (doc.kind !== 'stamp') throw new Error('invalid stamp share')
    await importSharedStamp(doc)
    return t('share.recordImported', { title: doc.title })
  },
}
const intakeAdapter: ShareAdapter = {
  preview: (doc, t) => doc.kind === 'intake' ? [t('share.intakePreview', { date: doc.data.dateKey, time: doc.data.time, name: doc.data.name, grams: doc.data.grams, kcal: doc.data.kcal })] : [],
  import: async (doc, t) => {
    if (doc.kind !== 'intake') throw new Error('invalid intake share')
    await importSharedIntake(doc)
    return t('share.recordImported', { title: doc.title })
  },
}
const financeAdapter: ShareAdapter = {
  preview: (doc, t) => doc.kind === 'finance' ? [t('share.financePreview', { date: doc.data.dateKey, kind: doc.data.kind, amount: doc.data.amount, name: doc.data.name })] : [],
  import: async (doc, t) => {
    if (doc.kind !== 'finance') throw new Error('invalid finance share')
    await importSharedFinance(doc)
    return t('share.recordImported', { title: doc.title })
  },
}

const ADAPTERS: Partial<Record<ShareKind, ShareAdapter>> = {
  food: foodAdapter,
  meal: mealAdapter,
  diary: diaryAdapter,
  stamp: stampAdapter,
  intake: intakeAdapter,
  finance: financeAdapter,
}

export function getShareAdapter(doc: ShareDoc): ShareAdapter {
  const adapter = ADAPTERS[doc.kind]
  if (!adapter) throw new Error(`Share adapter not implemented: ${doc.kind}`)
  return adapter
}
