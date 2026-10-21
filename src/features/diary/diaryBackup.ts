/**
 * 全量备份文件的形状与校验。
 *
 * 为什么单独定一个形状，而不是复用日记页那份「导出选中」的 JSON：
 *   - 备份必须带上天气（diaryDays）。日记页那份是按天拼给人和 AI 看的，本来就没有天气这一块，
 *     拿它当备份恢复出来会丢天气。
 *   - 备份要能自证身份：带 app 标记和版本号，才能对用户说清「这份文件不是星芒记录者导出的」。
 *   - 备份要把回收站里的东西也带上（deletedAt 原样保留），删掉的东西也是你的数据。
 *
 * 校验刻意宽容：坏条目单独剔掉并报数，而不是整份拒绝——
 * 不该因为你备份里有一条脏数据，就让你丢掉整个备份。
 */
import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'
import { newCode } from '@/core/utils/id'
import type { ExportFile } from './diaryExport'

const BACKUP_APP = 'starburst-recorder'
const BACKUP_VERSION = 1

export interface BackupPayload {
  entries: DiaryEntry[]
  stamps: DiaryStamp[]
  days: DiaryDay[]
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 打成一份可以下载的备份文件 */
export function buildBackup(payload: BackupPayload): ExportFile {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`
  return {
    label: '备份 JSON',
    filename: `星芒记录者-备份-${stamp}.json`,
    mime: 'application/json',
    content: JSON.stringify(
      {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        ...payload,
      },
      null,
      2,
    ),
  }
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 日期键必须是 YYYY-MM-DD，别的都不认 */
function dateKey(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/**
 * 一条一条挑字段：只留 schema 里认识的，顺手把不合格的剔掉（返回 null）。
 * 已知字段缺失时补默认值，缺失的短编号（code）现场生成一个——老备份可能没有它。
 */
function pickEntry(raw: unknown): DiaryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  return {
    id,
    code: text(item.code) || newCode(),
    dateKey: day,
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    content: text(item.content),
    deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : null,
  }
}

function pickStamp(raw: unknown): DiaryStamp | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const day = dateKey(item.dateKey)
  if (id === '' || day === null) return null
  const time = text(item.time)
  return {
    id,
    dateKey: day,
    // 时间必须是 HH:MM，坏的就退回 '00:00'，免得一条脏数据废掉整份备份
    time: /^\d{2}:\d{2}$/.test(time) ? time : '00:00',
    content: text(item.content),
    createdAt: number(item.createdAt, Date.now()),
    updatedAt: number(item.updatedAt, Date.now()),
    deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : null,
  }
}

function pickDay(raw: unknown): DiaryDay | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const day = dateKey(item.dateKey)
  if (day === null) return null
  return {
    dateKey: day,
    weather: text(item.weather),
    updatedAt: number(item.updatedAt, Date.now()),
  }
}

export interface BackupReadResult {
  ok: boolean
  /** 读不出来时的人话解释 */
  error: string
  payload: BackupPayload
  /** 格式不对、被剔掉的条数 */
  skipped: number
}

const EMPTY: BackupPayload = { entries: [], stamps: [], days: [] }

function fail(error: string): BackupReadResult {
  return { ok: false, error, payload: EMPTY, skipped: 0 }
}

/** 读一份备份文本，校验并挑出可用的数据 */
export function readBackup(text: string): BackupReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('这个文件不是 JSON，或者内容已经坏了。请选星芒记录者导出的 .json 备份文件。')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('这个文件的内容不是一份备份。请选星芒记录者导出的 .json 备份文件。')
  }

  const bag = raw as Record<string, unknown>
  const list = (key: string) => (Array.isArray(bag[key]) ? (bag[key] as unknown[]) : [])
  const rawEntries = list('entries')
  const rawStamps = list('stamps')
  const rawDays = list('days')

  if (rawEntries.length === 0 && rawStamps.length === 0) {
    return fail('这份文件里没有任何日记或随记，可能不是星芒记录者导出的备份。')
  }

  const entries = rawEntries.map(pickEntry).filter((item): item is DiaryEntry => item !== null)
  const stamps = rawStamps.map(pickStamp).filter((item): item is DiaryStamp => item !== null)
  const days = rawDays.map(pickDay).filter((item): item is DiaryDay => item !== null)
  const skipped =
    rawEntries.length + rawStamps.length + rawDays.length - entries.length - stamps.length - days.length

  if (entries.length === 0 && stamps.length === 0) {
    return fail('这份文件里的日记和随记都对不上格式，没法导入。')
  }

  return { ok: true, error: '', payload: { entries, stamps, days }, skipped }
}
