/**
 * 更新下载中的专属面板：百分比、进度条、已下/总量。
 *
 * 单独抽出来是为了窄屏也能一眼看清——原来的进度条挤在更新说明底下，
 * 内容一长就掉到屏幕外，用户只能干等。
 */
import { useI18n } from '@/shared/i18n/context'
import { formatMb, progressPercent } from './downloadProgress'
import type { DownloadProgress } from './updateService'

export default function DownloadProgressPanel({
  fileName,
  progress,
}: {
  fileName: string
  progress: DownloadProgress | null
}) {
  const { t } = useI18n()
  const percent = progressPercent(progress)

  return (
    <div>
      <p className="m-0 text-sm font-medium text-fg">{t('update.downloadTitle')}</p>
      <p className="m-0 mt-1 truncate text-xs text-muted">{fileName}</p>

      <p className="m-0 mt-5 text-center text-4xl font-medium tabular-nums text-fg">
        {percent === null ? '…' : `${percent}%`}
      </p>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full bg-brand ${
            percent === null ? 'animate-pulse' : 'transition-all duration-300'
          }`}
          style={{ width: percent === null ? '100%' : `${percent}%` }}
        />
      </div>

      <p className="m-0 mt-2 text-center text-xs tabular-nums text-muted">
        {progress && progress.total > 0
          ? t('update.downloadProgress', {
              received: formatMb(progress.received),
              total: formatMb(progress.total),
            })
          : progress
            ? t('update.downloaded', { received: formatMb(progress.received) })
            : t('update.downloadWaiting')}
      </p>

      <p className="m-0 mt-4 text-center text-xs text-muted">{t('update.downloadHint')}</p>
    </div>
  )
}
