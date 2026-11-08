/** 从旧记录中挑一张照片；只有用户本轮明确点名记录和照片才返回像素。 */
import type { AssistantDataSource, BackupData } from '@/core/db/store'
import type { DiaryImage } from '@/core/db/schema'
import { shiftDay } from '@/core/utils/dateKey'

export type RecordPhotoKind = 'diary' | 'stamps' | 'finance' | 'foods' | 'meals'
export interface RecordPhotoRecord {
  id: string
  code?: string
  dateKey?: string
  name?: string
  images?: DiaryImage[]
  photo?: string | null
  deletedAt: number | null
}
export interface RecordPhotoTarget { id: string; code?: string }
export type RecordPhotoResult =
  | { ok: true; dataUrl: string; label: string }
  | { ok: false; error: string }

const PHOTO_WORD = /图片|照片|图像|相片|image|photo|picture/i
const READ_WORD = /看看|看下|看一看|分析|识别|读取|读一下|解释|是什么|有什么|发给|传给|analy[sz]e|look|read|describe|what/i
const NEGATION = /不要|别发|别传|不用看|无需|不必|do not|don't|without/i

function mentioned(text: string, ref: string, dateKey: string | undefined, name: string | undefined, today: string) {
  const lower = text.toLowerCase()
  if (ref && lower.includes(ref.toLowerCase())) return true
  if (name && lower.includes(name.toLowerCase())) return true
  if (!dateKey) return false
  if (lower.includes(dateKey)) return true
  const [, month, day] = dateKey.split('-')
  if (lower.includes(`${Number(month)}月${Number(day)}日`)) return true
  if (dateKey === today && /今天|今日|today/i.test(text)) return true
  return dateKey === shiftDay(today, -1) && /昨天|昨日|yesterday/i.test(text)
}

/** 用无图摘要先判断是否真的是用户点名的旧照片请求，避免误触发整库读图。 */
export function findExplicitRecordPhotoTarget(
  data: AssistantDataSource,
  kind: RecordPhotoKind,
  ref: string,
  index: number,
  userText: string,
  today: string,
): RecordPhotoTarget | null {
  if (!PHOTO_WORD.test(userText) || !READ_WORD.test(userText) || NEGATION.test(userText)) return null
  if (!ref || !Number.isInteger(index) || index < 1) return null
  let records: RecordPhotoRecord[]
  switch (kind) {
    case 'diary': records = data.entries; break
    case 'stamps': records = data.stamps; break
    case 'finance': records = data.finance; break
    case 'foods': records = data.foods; break
    case 'meals': records = data.meals; break
  }
  const matches = records.filter(
    (item) => item.deletedAt === null && (item.id === ref || item.code === ref || item.dateKey === ref || item.name === ref),
  )
  if (matches.length !== 1 || !mentioned(userText, ref, matches[0].dateKey, matches[0].name, today)) {
    return null
  }
  return { id: matches[0].id, ...(matches[0].code ? { code: matches[0].code } : {}) }
}

/** 只根据单条已按 id 加载的记录取图，不必导出整库。 */
export function selectRecordPhotoFromRecord(
  record: RecordPhotoRecord,
  kind: RecordPhotoKind,
  ref: string,
  index: number,
  userText: string,
  today: string,
): RecordPhotoResult {
  if (!PHOTO_WORD.test(userText) || !READ_WORD.test(userText) || NEGATION.test(userText)) {
    return { ok: false, error: '用户本轮没有明确要求分析旧记录照片，不能发送图片。' }
  }
  if (!ref || !Number.isInteger(index) || index < 1) return { ok: false, error: '请给出记录编号或日期，以及从 1 开始的图片序号。' }
  if (record.deletedAt !== null || !mentioned(userText, ref, record.dateKey, record.name, today)) {
    return { ok: false, error: '找不到这条有效记录的照片，或用户没有明确指出这条记录。' }
  }
  const photos = record.images?.map((item) => item.dataUrl) ?? (record.photo ? [record.photo] : [])
  if (photos.length === 0) return { ok: false, error: '这条记录没有照片。' }
  if (index > photos.length) return { ok: false, error: `这条记录只有 ${photos.length} 张照片。` }
  if (photos.length > 1 && !new RegExp(`第\\s*${index}\\s*张|第\\s*${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][index] ?? ''}\\s*张|${index}(?:st|nd|rd|th)?\\s*(?:image|photo|picture)`, 'i').test(userText)) {
    return { ok: false, error: `这条记录有 ${photos.length} 张照片，请用户明确说第几张。` }
  }
  const dataUrl = photos[index - 1]
  if (!dataUrl.startsWith('data:image/')) return { ok: false, error: '这张照片格式不支持。' }
  return { ok: true, dataUrl, label: `${kind} ${record.code ?? record.name ?? record.dateKey ?? record.id} 第 ${index} 张` }
}

export function selectRecordPhoto(
  data: BackupData,
  kind: RecordPhotoKind,
  ref: string,
  index: number,
  userText: string,
  today: string,
): RecordPhotoResult {
  if (!PHOTO_WORD.test(userText) || !READ_WORD.test(userText) || NEGATION.test(userText)) {
    return { ok: false, error: '用户本轮没有明确要求分析旧记录照片，不能发送图片。' }
  }
  if (!ref || !Number.isInteger(index) || index < 1) return { ok: false, error: '请给出记录编号或日期，以及从 1 开始的图片序号。' }

  const match = (rows: RecordPhotoRecord[]) =>
    rows.filter((item) => item.deletedAt === null && (item.id === ref || item.code === ref || item.dateKey === ref || item.name === ref))
  let records: RecordPhotoRecord[]
  switch (kind) {
    case 'diary': records = match(data.entries); break
    case 'stamps': records = match(data.stamps); break
    case 'finance': records = match(data.finance); break
    case 'foods': records = match(data.foods); break
    case 'meals': records = match(data.meals); break
  }
  if (records.length !== 1) return { ok: false, error: records.length ? '同一日期有多条记录，请先查短编号再指定其中一条。' : '找不到这条有效记录的照片。' }
  return selectRecordPhotoFromRecord(records[0], kind, ref, index, userText, today)
}
