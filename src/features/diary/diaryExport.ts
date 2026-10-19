import type { DiaryEntry, DiaryStamp } from '../../core/db/schema'
import { formatDateCn, weekdayLabel } from '../../core/utils/dateKey'

export type ExportFormat = 'markdown' | 'text' | 'json'

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
      content: JSON.stringify({ exportedAt: now.toISOString(), entries, stamps }, null, 2),
    }
  }

  const lines: string[] = []
  for (const day of daysOf(entries, stamps)) {
    if (format === 'markdown') {
      lines.push(`# ${formatDateCn(day)} ${weekdayLabel(day)}`, '')
    } else {
      lines.push(`${formatDateCn(day)} ${weekdayLabel(day)}`, '------------------------------', '')
    }

    const dayEntries = entries
      .filter((entry) => entry.dateKey === day)
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const entry of dayEntries) {
      lines.push(entry.content.trim() || '（没有写内容）', '')
    }

    const dayStamps = stamps
      .filter((item) => item.dateKey === day)
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
    if (dayStamps.length > 0) {
      if (format === 'markdown') lines.push('随记：', '')
      for (const item of dayStamps) {
        const body = `${item.time} ${item.content.trim()}`
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

/** 触发浏览器下载 */
export function downloadExport(file: ExportFile) {
  const blob = new Blob([file.content], { type: file.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  URL.revokeObjectURL(url)
}
