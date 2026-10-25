/**
 * 一行极轻的创建 / 编辑时间。
 *
 * 目的是「需要时能找到，不需要时不碍眼」：10px 的灰字、贴在内容下面，
 * 只在真的被编辑过时才多出半句「改于 …」。纸面和卡片底各有一套墨色。
 */
import { formatShortStamp } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'

/** 两次时间差小于这个数就当没改过：同一秒内的保存不算编辑 */
const EDIT_THRESHOLD_MS = 60 * 1000

export default function TimeMeta({
  createdAt,
  updatedAt,
  tone = 'surface',
}: {
  createdAt: number
  updatedAt: number
  /** 纸面上用 ink 系灰，卡片上用界面系灰 */
  tone?: 'surface' | 'paper'
}) {
  const { t } = useI18n()
  const edited = updatedAt - createdAt > EDIT_THRESHOLD_MS
  const color = tone === 'paper' ? 'text-ink-muted' : 'text-muted'

  return (
    <p className={`m-0 mt-1 text-[10px] leading-none tabular-nums ${color}`}>
      {t('timemeta.created', { at: formatShortStamp(createdAt) })}
      {edited && (
        <span className="ml-2">{t('timemeta.edited', { at: formatShortStamp(updatedAt) })}</span>
      )}
    </p>
  )
}
