import type { DownloadProgress } from './updateService'

/** 百分比：服务端没给总长度时返回 null，界面用不确定进度条 */
export function progressPercent(progress: DownloadProgress | null): number | null {
  if (!progress || progress.total <= 0) return null
  const percent = Math.round((progress.received / progress.total) * 100)
  return Math.max(0, Math.min(100, percent))
}

/** 进度上显示的 MB 数，保留一位小数 */
export function formatMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1)
}
