/**
 * 健康模块的日期导航：摄入 / 睡眠 / 体重三个一级页共用。
 *
 * 跟日记页同一条口径：‹ 前一天、日期本身是选择入口、非今天时多一个「今天」、
 * 右边 › 后一天。今天绿、其他日期黄，一眼知道在看哪天。
 */
import { useI18n } from '@/shared/i18n/context'
import { formatDate, relativeDayKey, shiftDay, todayKey, weekdayKey } from '@/core/utils/dateKey'

export default function HealthDayNav({
  dayKey,
  onChange,
  onPick,
}: {
  dayKey: string
  onChange: (next: string) => void
  /** 点日期时打开日历选择器 */
  onPick: () => void
}) {
  const { t } = useI18n()
  const isToday = dayKey === todayKey()

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftDay(dayKey, -1))}
        aria-label={t('health.prevDay')}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
      >
        ‹
      </button>

      <button
        type="button"
        onClick={onPick}
        aria-label={t('health.pickDate')}
        className="font-hand flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
      >
        <span
          className={[
            'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
            isToday ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
          ].join(' ')}
        >
          {t(relativeDayKey(dayKey))}
        </span>
        <span className="min-w-0 truncate text-sm">{formatDate(dayKey, t)}</span>
        <span className="hidden shrink-0 text-xs text-muted min-[360px]:inline">
          {t(weekdayKey(dayKey))}
        </span>
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(todayKey())}
          className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
        >
          {t('health.backToToday')}
        </button>
      )}

      <button
        type="button"
        onClick={() => onChange(shiftDay(dayKey, 1))}
        aria-label={t('health.nextDay')}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
      >
        ›
      </button>
    </div>
  )
}
