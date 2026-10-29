/**
 * 「挑选记录导出」：用户逐条勾选日记、随记、健康摄入、收支，
 * 混在一起导出一份给 AI 或别人看的文件。
 *
 * 和 diaryExport.ts 的区别：
 *   - 那份从日记页出发，按「天 / 区间 / 当前选中」取日记与随记，服务日记模块。
 *   - 这份从整库取数，只认 id，四类记录可以混选，服务「我想把这几条单独拿出来」。
 *
 * 和 diaryBackup.ts 的区别：备份是整库的快照（带版本、可恢复），这里只是可读文本 / 原始记录。
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
  HealthSleep,
  WeighIn,
} from '@/core/db/schema'
import { sleepMinutes, sleepParts } from '@/features/health/sleepMath'
import { formatClock, formatDateCn, formatShortStamp, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherLabel } from '@/features/diary/weather'
import type { BackupPayload } from '@/features/diary/diaryBackup'
import type { ExportFile, ExportFormat } from '@/features/diary/diaryExport'
import { translate } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export type RecordKind = 'diary' | 'stamp' | 'intake' | 'sleep' | 'weight' | 'finance'

/** 固定顺序：文件里按这个顺序分组，勾选面板也按这个顺序排 */
export const RECORD_KINDS: RecordKind[] = ['diary', 'stamp', 'intake', 'sleep', 'weight', 'finance']

/** 各类记录各自勾了哪些 id；可以混在同一份文件里 */
export type RecordSelection = Record<RecordKind, string[]>

/** 空文件、空勾选都从这份开始，免得各处手写一串空数组 */
export function emptySelection(): RecordSelection {
  return { diary: [], stamp: [], intake: [], sleep: [], weight: [], finance: [] }
}

export function selectionSize(selection: RecordSelection): number {
  return RECORD_KINDS.reduce((sum, kind) => sum + selection[kind].length, 0)
}

/** 点一下某条记录：没勾就勾上，勾了就取消 */
export function toggleSelection(
  selection: RecordSelection,
  kind: RecordKind,
  id: string,
): RecordSelection {
  const ids = selection[kind]
  const next = { ...selection }
  next[kind] = ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
  return next
}

/** 列表里的一行：四种记录压成同一个形状，勾选和导出都只认这个 */
export interface RecordItem {
  kind: RecordKind
  id: string
  code: string
  dateKey: string
  /** 'HH:MM'：随记 / 摄入用记录里的时刻，其余由创建时间推出来 */
  time: string
  createdAt: number
  /** 一眼能认出内容的正文：日记 / 随记是内容，摄入 / 收支是名称 */
  text: string
  /** 补充信息：摄入是热量与蛋白质，收支是金额，其余为空 */
  detail: string
}

function byTime(a: RecordItem, b: RecordItem): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
  if (a.time !== b.time) return a.time < b.time ? -1 : 1
  return a.createdAt - b.createdAt
}

function diaryItems(entries: DiaryEntry[]): RecordItem[] {
  return entries
    .filter((entry) => entry.deletedAt === null)
    .map((entry) => ({
      kind: 'diary' as const,
      id: entry.id,
      code: entry.code,
      dateKey: entry.dateKey,
      time: formatClock(entry.createdAt),
      createdAt: entry.createdAt,
      text: entry.content.trim(),
      detail: '',
    }))
}

function stampItems(stamps: DiaryStamp[]): RecordItem[] {
  return stamps
    .filter((stamp) => stamp.deletedAt === null)
    .map((stamp) => ({
      kind: 'stamp' as const,
      id: stamp.id,
      code: stamp.code,
      dateKey: stamp.dateKey,
      time: stamp.time,
      createdAt: stamp.createdAt,
      text: stamp.content.trim(),
      detail: '',
    }))
}

function intakeItems(intakes: HealthIntake[]): RecordItem[] {
  return intakes
    .filter((intake) => intake.deletedAt === null)
    .map((intake) => ({
      kind: 'intake' as const,
      id: intake.id,
      code: intake.code,
      dateKey: intake.dateKey,
      time: intake.time,
      createdAt: intake.createdAt,
      text: intake.name,
      detail: translate('records.intakeDetail', {
        kcal: Math.round(intake.kcal * 100) / 100,
        protein: Math.round(intake.protein * 100) / 100,
      }),
    }))
}

function sleepItems(sleeps: HealthSleep[]): RecordItem[] {
  return sleeps
    .filter((sleep) => sleep.deletedAt === null)
    .map((sleep) => {
      const parts = sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime))
      return {
        kind: 'sleep' as const,
        id: sleep.id,
        code: sleep.code,
        dateKey: sleep.dateKey,
        time: sleep.wakeTime,
        createdAt: sleep.createdAt,
        text: sleep.bedtime + ' \u2192 ' + sleep.wakeTime,
        detail:
          translate('records.sleepDetail', { h: parts.h, m: parts.m }) +
          (sleep.quality !== null ? ' \u00b7 ' + '\u2605'.repeat(sleep.quality) : ''),
      }
    })
}

function weightItems(weighIns: WeighIn[]): RecordItem[] {
  return weighIns.map((item) => ({
    kind: 'weight' as const,
    // 称重一天最多一条，没有库里的 id，就拿日期当导出用的 id
    id: 'weight:' + item.dateKey,
    code: '',
    dateKey: item.dateKey,
    time: formatClock(item.createdAt),
    createdAt: item.createdAt,
    text: item.weightKg + ' ' + translate('health.weighUnit'),
    detail: '',
  }))
}

function financeItems(entries: FinanceEntry[]): RecordItem[] {
  return entries
    .filter((entry) => entry.deletedAt === null)
    .map((entry) => ({
      kind: 'finance' as const,
      id: entry.id,
      // 收支表还没有短编号：列表里别把内部 id 当编号露出来
      code: '',
      dateKey: entry.dateKey,
      time: formatClock(entry.createdAt),
      createdAt: entry.createdAt,
      text: entry.name,
      detail: entry.amount.toFixed(2),
    }))
}

/** 某一类里所有还在用的记录，按日期、时刻排序 */
export function recordsOf(payload: BackupPayload, kind: RecordKind): RecordItem[] {
  if (kind === 'diary') return diaryItems(payload.entries).sort(byTime)
  if (kind === 'stamp') return stampItems(payload.stamps).sort(byTime)
  if (kind === 'intake') return intakeItems(payload.intakes).sort(byTime)
  if (kind === 'sleep') return sleepItems(payload.sleeps).sort(byTime)
  if (kind === 'weight') return weightItems(payload.profile?.weighIns ?? []).sort(byTime)
  return financeItems(payload.finance).sort(byTime)
}

/** 勾选的记录，按「日记 / 随记 / 摄入 / 收支」固定顺序摊平 */
export function selectedRecords(
  payload: BackupPayload,
  selection: RecordSelection,
): RecordItem[] {
  return RECORD_KINDS.flatMap((kind) => {
    const picked = new Set(selection[kind])
    return recordsOf(payload, kind).filter((item) => picked.has(item.id))
  })
}

/** 列表上的时间筛选：只影响眼下看到哪些行，已经勾上的不因为被筛掉就取消 */
export function filterByDate(items: RecordItem[], from: string, to: string): RecordItem[] {
  return items.filter((item) => item.dateKey >= from && item.dateKey <= to)
}

const KIND_TITLE_KEY: Record<RecordKind, MessageKey> = {
  diary: 'records.kindDiary',
  stamp: 'records.kindStamp',
  intake: 'records.kindIntake',
  sleep: 'records.kindSleep',
  weight: 'records.kindWeight',
  finance: 'records.kindFinance',
}

function kindTitle(kind: RecordKind): string {
  return translate(KIND_TITLE_KEY[kind])
}

function lineOf(item: RecordItem): string {
  const body =
    item.text || (item.kind === 'diary' || item.kind === 'stamp' ? translate('records.previewEmpty') : '')
  if (item.kind === 'finance') return item.detail ? `${body} · ${item.detail}` : body
  const detail = item.detail ? ` · ${item.detail}` : ''
  return `${item.time} ${body}${detail}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 文件名里的时间戳：YYYYMMDD-HHmm */
function exportStamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`
}

export interface RecordExportOptions {
  /** 日记 / 随记所在日期的天气；默认带上 */
  includeWeather?: boolean
}

/**
 * 打成一份可下载的文件。
 *
 * Markdown：一天一节，节内按种类分组，适合直接贴给 AI。
 * 纯文本：同样的顺序，用 `[种类]` 标出段落，不带任何标记。
 * JSON：只保留勾选的原始行，字段一个不少，方便程序再处理。
 */
export function buildRecordExport(
  payload: BackupPayload,
  selection: RecordSelection,
  format: ExportFormat,
  options: RecordExportOptions = {},
): ExportFile {
  const now = new Date()
  const base = `${translate('records.exportFileBase')}-${exportStamp(now)}`
  const picked = selectedRecords(payload, selection)
  const includeWeather = options.includeWeather !== false
  // 天气只跟日记 / 随记走：只勾摄入和收支时，日子本身不算这次导出的一部分
  const datedKinds = new Set<RecordKind>(['diary', 'stamp'])
  const pickedDates = new Set(
    picked.filter((item) => datedKinds.has(item.kind)).map((item) => item.dateKey),
  )
  const days = payload.days.filter((day) => pickedDates.has(day.dateKey))

  if (format === 'json') {
    const kept = new Set<RecordKind>(RECORD_KINDS.filter((kind) => selection[kind].length > 0))
    return {
      label: 'JSON',
      filename: `${base}.json`,
      mime: 'application/json',
      content: JSON.stringify(
        {
          app: 'starburst-recorder',
          kind: 'records',
          exportedAt: now.toISOString(),
          ...(kept.has('diary')
            ? { entries: payload.entries.filter((row) => selection.diary.includes(row.id) && row.deletedAt === null) }
            : {}),
          ...(kept.has('stamp')
            ? { stamps: payload.stamps.filter((row) => selection.stamp.includes(row.id) && row.deletedAt === null) }
            : {}),
          ...(kept.has('intake')
            ? { intakes: payload.intakes.filter((row) => selection.intake.includes(row.id) && row.deletedAt === null) }
            : {}),
          ...(kept.has('sleep')
            ? { sleeps: payload.sleeps.filter((row) => selection.sleep.includes(row.id) && row.deletedAt === null) }
            : {}),
          ...(kept.has('weight')
            ? {
                weights: (payload.profile?.weighIns ?? []).filter((row) =>
                  selection.weight.includes('weight:' + row.dateKey),
                ),
              }
            : {}),
          ...(kept.has('finance')
            ? { finance: payload.finance.filter((row) => selection.finance.includes(row.id) && row.deletedAt === null) }
            : {}),
          ...(includeWeather && days.length > 0 ? { days } : {}),
        },
        null,
        2,
      ),
    }
  }

  const weatherByDay = new Map<string, string | null>(
    includeWeather ? days.map((day) => [day.dateKey, day.weather]) : [],
  )
  const dates = [...new Set(picked.map((item) => item.dateKey))].sort()
  const lines: string[] = []
  const markdown = format === 'markdown'

  if (markdown) {
    lines.push(`# ${translate('records.exportDocTitle')}`, '')
  } else {
    lines.push(translate('records.exportDocTitle'), '==============================', '')
  }
  lines.push(translate('records.exportedAtLine', { time: formatShortStamp(now.getTime()) }), '')

  for (const date of dates) {
    if (markdown) {
      lines.push(`## ${formatDateCn(date)} ${weekdayLabel(date)}`, '')
    } else {
      lines.push(`${formatDateCn(date)} ${weekdayLabel(date)}`, '------------------------------', '')
    }

    const states = parseWeather(weatherByDay.get(date))
    if (states.length > 0) {
      lines.push(translate('records.weatherLine', { weather: weatherLabel(states) }), '')
    }

    for (const kind of RECORD_KINDS) {
      const items = picked.filter((item) => item.kind === kind && item.dateKey === date)
      if (items.length === 0) continue

      if (markdown) {
        lines.push(`### ${kindTitle(kind)}`, '')
        for (const item of items) {
          if (item.kind === 'diary') {
            lines.push(item.text || translate('records.previewEmpty'), '')
          } else {
            lines.push(`- ${lineOf(item)}`)
          }
        }
        lines.push('')
      } else {
        lines.push(`[${kindTitle(kind)}]`)
        for (const item of items) {
          lines.push(
            item.kind === 'diary'
              ? item.text || translate('records.previewEmpty')
              : lineOf(item),
          )
        }
        lines.push('')
      }
    }
  }

  return {
    label: markdown ? 'Markdown' : translate('records.plainTextLabel'),
    filename: `${base}.${markdown ? 'md' : 'txt'}`,
    mime: 'text/plain;charset=utf-8',
    content: lines.join('\n'),
  }
}

/** JSON 里各类记录各自的字段名，与整库挑选导出保持一致 */
const KIND_FIELD: Record<
  RecordKind,
  'entries' | 'stamps' | 'intakes' | 'sleeps' | 'weights' | 'finance'
> = {
  diary: 'entries',
  stamp: 'stamps',
  intake: 'intakes',
  sleep: 'sleeps',
  weight: 'weights',
  finance: 'finance',
}

/**
 * 单条导出：JSON 结构与「挑选记录导出」完全一致，只装这一条。
 * 日记 / 随记把当天的天气一并带上；摄入和收支没有天气，不带 days。
 */
export function buildSingleRecordExport(
  kind: RecordKind,
  row: DiaryEntry | DiaryStamp | HealthIntake | HealthSleep | WeighIn | FinanceEntry,
  day?: DiaryDay | null,
): ExportFile {
  const now = new Date()
  return {
    label: 'JSON',
    filename: `${translate('records.singleFileBase')}-${kindTitle(kind)}-${exportStamp(now)}.json`,
    mime: 'application/json',
    content: JSON.stringify(
      {
        app: 'starburst-recorder',
        kind: 'records',
        exportedAt: now.toISOString(),
        [KIND_FIELD[kind]]: [row],
        ...(day && (kind === 'diary' || kind === 'stamp') ? { days: [day] } : {}),
      },
      null,
      2,
    ),
  }
}
