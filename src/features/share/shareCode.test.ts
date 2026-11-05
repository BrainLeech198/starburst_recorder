import { describe, expect, it } from 'vitest'
import {
  SHARE_APP,
  SHARE_QR_MAX_CHARS,
  SHARE_VERSION,
  decodeShare,
  encodeShare,
  fitsShareQr,
  hasSharePhotos,
  stripSharePhotos,
} from './shareCode'
import type { ShareDoc } from './shareCode'

const PHOTO = 'data:image/png;base64,AAAA'

function foodDoc(): ShareDoc {
  return {
    app: SHARE_APP,
    v: SHARE_VERSION,
    kind: 'food',
    title: '鸡胸肉',
    createdAt: 1,
    data: {
      name: '鸡胸肉',
      code: 'abc1234',
      tags: ['肉类', '高蛋白'],
      kcal: 133,
      protein: 31,
      carbs: 0,
      fat: 2.5,
      servingName: '一块',
      servingGrams: 120,
      photo: PHOTO,
    },
  }
}

function mealDoc(): ShareDoc {
  return {
    app: SHARE_APP,
    v: SHARE_VERSION,
    kind: 'meal',
    title: '鸡腿饭',
    createdAt: 2,
    data: {
      name: '鸡腿饭',
      photo: PHOTO,
      items: [
        {
          food: {
            name: '鸡腿',
            code: 'def5678',
            tags: [],
            kcal: 200,
            protein: 18,
            carbs: 2,
            fat: 12,
            servingName: null,
            servingGrams: null,
            photo: null,
          },
          grams: 150,
        },
        {
          food: {
            name: '米饭',
            code: 'aaa1111',
            tags: ['主食'],
            kcal: 116,
            protein: 2.6,
            carbs: 25.9,
            fat: 0.3,
            servingName: '一碗',
            servingGrams: 200,
            photo: PHOTO,
          },
          grams: 200,
        },
      ],
    },
  }
}

describe('shareCode', () => {
  it('分享码往返保留完整字段（含照片）', async () => {
    const doc = mealDoc()
    const text = await encodeShare(doc)
    expect(text.startsWith('SB')).toBe(true)
    await expect(decodeShare(text)).resolves.toEqual(doc)
  })

  it('也接受直接粘贴的 JSON', async () => {
    const doc = foodDoc()
    await expect(decodeShare(JSON.stringify(doc))).resolves.toEqual(doc)
  })

  it('旧版食物分享没有 tags 时补空数组', async () => {
    const doc = foodDoc()
    if (doc.kind !== 'food') throw new Error('kind changed')
    const { tags: _tags, ...legacyData } = doc.data
    expect(_tags).toEqual(['肉类', '高蛋白'])
    const parsed = await decodeShare(JSON.stringify({ ...doc, data: legacyData }))
    if (parsed.kind !== 'food') throw new Error('kind changed')
    expect(parsed.data.tags).toEqual([])
  })

  it('旧版套餐分享没有封面字段也能读，照片按 null 处理', async () => {
    const doc = mealDoc()
    if (doc.kind !== 'meal') throw new Error('kind changed')
    const legacy = {
      ...doc,
      data: { name: doc.data.name, items: doc.data.items },
    }
    const parsed = await decodeShare(JSON.stringify(legacy))
    if (parsed.kind !== 'meal') throw new Error('kind changed')
    expect(parsed.data.photo).toBeNull()
    expect(parsed.data.items).toHaveLength(2)
  })

  it('去照片版本只清掉图片，其余不变', () => {
    const doc = mealDoc()
    expect(hasSharePhotos(doc)).toBe(true)
    const thin = stripSharePhotos(doc)
    expect(hasSharePhotos(thin)).toBe(false)
    if (thin.kind !== 'meal') throw new Error('kind changed')
    expect(thin.data.photo).toBeNull()
    expect(thin.data.items.map((item) => item.food.name)).toEqual(['鸡腿', '米饭'])
    expect(thin.data.items[0].grams).toBe(150)
  })

  it('拒绝无效文本、错误版本和损坏的分享码', async () => {
    await expect(decodeShare('hello')).rejects.toThrow()
    await expect(decodeShare('SB1.@@@')).rejects.toThrow()
    await expect(decodeShare(JSON.stringify({ ...foodDoc(), v: 2 }))).rejects.toThrow()
    await expect(decodeShare(JSON.stringify({ ...foodDoc(), app: 'other' }))).rejects.toThrow()
  })

  it('二维码容量判断按字符数封顶', () => {
    expect(fitsShareQr('a'.repeat(SHARE_QR_MAX_CHARS))).toBe(true)
    expect(fitsShareQr('a'.repeat(SHARE_QR_MAX_CHARS + 1))).toBe(false)
  })

  it('接受四类记录分享协议，并拒绝越界字段', async () => {
    const base = { app: SHARE_APP, v: SHARE_VERSION, createdAt: 1, title: '分享记录' }
    const records = [
      { ...base, kind: 'diary', data: { dateKey: '2026-11-03', content: '今天很好', images: [], tags: ['生活'] } },
      { ...base, kind: 'stamp', data: { dateKey: '2026-11-03', time: '12:30', content: '午餐', images: [], tags: [] } },
      { ...base, kind: 'intake', data: { dateKey: '2026-11-03', time: '12:30', name: '米饭', grams: 150, kcal: 174, protein: 3.6, carbs: 38, fat: 0.4 } },
      { ...base, kind: 'finance', data: { dateKey: '2026-11-03', time: '12:30:00', kind: 'expense', category: 'food', name: '午餐', amount: 25, photo: null, note: '' } },
    ]
    for (const record of records) {
      const decoded = await decodeShare(JSON.stringify(record))
      expect(decoded.kind).toBe(record.kind)
    }
    await expect(decodeShare(JSON.stringify({ ...records[2], data: { ...records[2].data, grams: -1 } }))).rejects.toThrow()
    await expect(decodeShare(JSON.stringify({ ...records[3], data: { ...records[3].data, amount: 0 } }))).rejects.toThrow()
  })
})
