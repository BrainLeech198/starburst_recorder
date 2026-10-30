import type { DiaryDay, DiaryEntry, DiaryStamp } from '@/core/db/schema'
import { formatDateCn, formatShortStamp, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherLabel } from './weather'
import { stripImageTokens } from './imageTokens'

export type ExportFormat = 'markdown' | 'text' | 'json'

/** 只影响 Markdown / 纯文本；JSON 始终保留全部字段 */
export interface ExportOptions {
  includeWeather?: boolean
  includeTimestamps?: boolean
}

/** 日期键是 'YYYY-MM-DD'，按字符串比较就是按时间比较 */
export function pickInRange<T extends { dateKey: string; deletedAt: number | null }>(
  items: T[],
  from: string,
  to: string,
): T[] {
  return items.filter(
    (item) => item.deletedAt === null && item.dateKey >= from && item.dateKey <= to,
  )
}

export interface ExportFile {
  /** 给提示条用的格式名 */
  label: string
  filename: string
  mime: string
  content: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function daysOf(entries: DiaryEntry[], stamps: DiaryStamp[]) {
  return [...new Set([...entries.map((e) => e.dateKey), ...stamps.map((s) => s.dateKey)])].sort()
}

/** 把选中的日记与随记拼成一份可读的导出内容 */
export function buildExport(
  entries: DiaryEntry[],
  stamps: DiaryStamp[],
  format: ExportFormat,
  days: DiaryDay[] = [],
  options: ExportOptions = {},
): ExportFile {
  const now = new Date()
  const stampText = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`
  const base = `星芒记录者-导出-${stampText}`

  if (format === 'json') {
    return {
      label: 'JSON',
      filename: `${base}.json`,
      mime: 'application/json',
      content: JSON.stringify({ exportedAt: now.toISOString(), entries, stamps, days }, null, 2),
    }
  }

  const weatherByDay = new Map(days.map((item) => [item.dateKey, item.weather]))
  const lines: string[] = []
  for (const day of daysOf(entries, stamps)) {
    if (format === 'markdown') {
      lines.push(`# ${formatDateCn(day)} ${weekdayLabel(day)}`, '')
    } else {
      lines.push(`${formatDateCn(day)} ${weekdayLabel(day)}`, '------------------------------', '')
    }

    const states = parseWeather(weatherByDay.get(day))
    if (options.includeWeather && states.length > 0) {
      lines.push(`天气：${weatherLabel(states)}`, '')
    }

    const dayEntries = entries
      .filter((entry) => entry.dateKey === day)
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const entry of dayEntries) {
      lines.push(stripImageTokens(entry.content).trim() || '（没有写内容）', '')
      if (options.includeTimestamps) {
        const created = `创建 ${formatShortStamp(entry.createdAt)}`
        const edited =
          entry.updatedAt !== entry.createdAt ? ` · 编辑 ${formatShortStamp(entry.updatedAt)}` : ''
        lines.push(`（${created}${edited}）`, '')
      }
    }

    const dayStamps = stamps
      .filter((item) => item.dateKey === day)
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
    if (dayStamps.length > 0) {
      if (format === 'markdown') lines.push('随记：', '')
      for (const item of dayStamps) {
        const body = `${item.time} ${stripImageTokens(item.content).trim()}`
        lines.push(format === 'markdown' ? `- ${body}` : body)
      }
      lines.push('')
    }
  }

  return {
    label: format === 'markdown' ? 'Markdown' : '纯文本',
    filename: `${base}.${format === 'markdown' ? 'md' : 'txt'}`,
    mime: 'text/plain;charset=utf-8',
    content: lines.join('\n'),
  }
}
