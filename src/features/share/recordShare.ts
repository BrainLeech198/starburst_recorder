/** 单条用户记录的分享构造与导入；跨设备只传内容，不传本机主键。 */
import type { DiaryEntry, DiaryStamp, HealthIntake, FinanceEntry, DiaryImage } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { addIntake } from '@/features/health/healthRepo'
import { addFinance } from '@/features/finance/financeRepo'
import { addStamp, createEntry, setEntryTags, setStampTags, updateContent, updateStamp } from '@/features/diary/diaryRepo'
import type { ShareDiaryDoc, ShareFinanceDoc, ShareIntakeDoc, ShareStampDoc } from './shareCode'
import { SHARE_APP, SHARE_VERSION } from './shareCode'

function packImages(content: string, images: DiaryImage[]) {
  const indexes = new Map(images.map((image, index) => [image.id, index]))
  return {
    content: content.replace(/\[\[img:([^\]]+)\]\]/g, (token, id: string) => {
      const index = indexes.get(id)
      return index === undefined ? token : `[[share-image:${index}]]`
    }),
    images: images.map(({ dataUrl, width, height }) => ({ dataUrl, width, height })),
  }
}

export function buildDiaryShare(entry: DiaryEntry): ShareDiaryDoc {
  return { app: SHARE_APP, v: SHARE_VERSION, kind: 'diary', title: entry.dateKey, createdAt: Date.now(), data: { dateKey: entry.dateKey, ...packImages(entry.content, entry.images), tags: [...entry.tags] } }
}

export function buildStampShare(stamp: DiaryStamp): ShareStampDoc {
  return { app: SHARE_APP, v: SHARE_VERSION, kind: 'stamp', title: stamp.content.slice(0, 80) || stamp.dateKey, createdAt: Date.now(), data: { dateKey: stamp.dateKey, time: stamp.time, ...packImages(stamp.content, stamp.images), tags: [...stamp.tags] } }
}

export function buildIntakeShare(intake: HealthIntake): ShareIntakeDoc {
  const { dateKey, time, name, grams, kcal, protein, carbs, fat } = intake
  return { app: SHARE_APP, v: SHARE_VERSION, kind: 'intake', title: name, createdAt: Date.now(), data: { dateKey, time, name, grams, kcal, protein, carbs, fat } }
}

export function buildFinanceShare(entry: FinanceEntry): ShareFinanceDoc {
  const { dateKey, time, kind, category, name, amount, photo, note } = entry
  return { app: SHARE_APP, v: SHARE_VERSION, kind: 'finance', title: name, createdAt: Date.now(), data: { dateKey, time, kind, category, name, amount, photo, note } }
}

function unpackImages(content: string, images: ShareDiaryDoc['data']['images']): { content: string; images: DiaryImage[] } {
  const mapped = images.map((image) => ({ ...image, id: newId() }))
  return {
    images: mapped,
    content: content.replace(/\[\[share-image:(\d+)\]\]/g, (token, rawIndex: string) => {
      const image = mapped[Number(rawIndex)]
      return image ? `[[img:${image.id}]]` : token
    }),
  }
}

export async function importSharedDiary(doc: ShareDiaryDoc): Promise<void> {
  const entry = await createEntry(doc.data.dateKey)
  const restored = unpackImages(doc.data.content, doc.data.images)
  await updateContent(entry.id, restored.content, restored.images)
  await setEntryTags(entry.id, doc.data.tags)
}

export async function importSharedStamp(doc: ShareStampDoc): Promise<void> {
  const stamp = await addStamp(doc.data.dateKey)
  const restored = unpackImages(doc.data.content, doc.data.images)
  await updateStamp(stamp.id, { time: doc.data.time, content: restored.content, images: restored.images })
  await setStampTags(stamp.id, doc.data.tags)
}

export async function importSharedIntake(doc: ShareIntakeDoc): Promise<void> {
  const now = Date.now()
  const data = doc.data
  const intake: HealthIntake = { ...data, id: newId(), code: newCode(), foodId: null, source: 'manual', mealId: null, components: null, createdAt: now, updatedAt: now, deletedAt: null }
  await addIntake(intake)
}

export async function importSharedFinance(doc: ShareFinanceDoc): Promise<void> {
  const now = Date.now()
  const data = doc.data
  const entry: FinanceEntry = { ...data, id: newId(), code: newCode(), createdAt: now, updatedAt: now, deletedAt: null }
  await addFinance(entry)
}
