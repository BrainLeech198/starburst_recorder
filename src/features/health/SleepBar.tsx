import type { HealthSleep } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import { sleepBarLayout } from './healthViz'

/**
 * 今日睡眠条：0 点在正中间，左右各 12 小时。
 * 浅色是「理想作息」窗口，实色是这一夜实际睡了多久；一眼就能看出是睡早了、睡晚了还是时长不够。
 */
export default function SleepBar({
  sleep,
  idealBedtime,
  idealWakeTime,
}: {
  sleep: HealthSleep
  idealBedtime: string
  idealWakeTime: string
}) {
  const { t } = useI18n()
  const bar = sleepBarLayout(sleep.bedtime, sleep.wakeTime, idealBedtime, idealWakeTime)
  const barWidth = Math.max(0, bar.endPct - bar.startPct)
  const idealWidth = Math.max(0, bar.idealEndPct - bar.idealStartPct)

  return (
    <div className="mt-3">
      <div className="relative h-9 w-full overflow-hidden rounded-lg border border-line bg-surface-2">
        {idealWidth > 0 && (
          <div
            className="absolute inset-y-0 bg-brand/15"
            style={{ left: `${bar.idealStartPct}%`, width: `${idealWidth}%` }}
          />
        )}
        <div
          className="absolute inset-y-1.5 rounded bg-brand/70"
          style={{ left: `${bar.startPct}%`, width: `${barWidth}%` }}
        />
        {/* 零点参考线压在睡眠条上面，谁都能一眼找到 0 点 */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted">
        <span>-12h</span>
        <span className="text-fg">0:00</span>
        <span>+12h</span>
      </div>
      <p className="m-0 mt-1 text-[10px] tabular-nums text-muted">
        {t('health.sleepBedtime')} {sleep.bedtime} → {t('health.sleepWake')} {sleep.wakeTime} ·{' '}
        {t('health.idealTitle')} {idealBedtime} → {idealWakeTime}
      </p>
    </div>
  )
}
