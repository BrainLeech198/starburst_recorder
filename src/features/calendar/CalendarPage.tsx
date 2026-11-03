/**
 * 日历总览：月历上按三块记录的条数混色，点一格进「一天一页」。
 *
 * 月份与图例筛选都进 URL（`?month=YYYY-MM&kind=diary`），刷新、分享、
 * 从某一天返回都停在原来的位置。颜色本身由 `calendarData` 纯函数算，
 * 这里只管排版和交互。
 */
import { Link, useSearchParams } from 'react-router'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { Icon } from '@/shared/ui/icons'
import { activityBetween } from './calendarRepo'
import ViewTabs from './ViewTabs'
import { countByDay, dateKeysOfMonth } from '@/features/schedule/scheduleMath'
import { schedules } from '@/features/schedule/scheduleRepo'
import {
  BLOCK_HEX,
  buildMonthGrid,
  isMonthKey,
  monthRange,
  shiftMonthKey,
  type CalendarFilter,
} from './calendarData'

/** 周一开头的星期表头：JS 的 0=周日，所以顺序是 1…6、0 */
const WEEKDAY_KEYS: MessageKey[] = [
  'date.weekdayShort1',
  'date.weekdayShort2',
  'date.weekdayShort3',
  'date.weekdayShort4',
  'date.weekdayShort5',
  'date.weekdayShort6',
  'date.weekdayShort0',
]

const FILTERS: { id: CalendarFilter; label: MessageKey; swatch: string }[] = [
  {
    id: 'all',
    label: 'calendar.legendAll',
    swatch: `linear-gradient(90deg, ${BLOCK_HEX.diary}, ${BLOCK_HEX.health}, ${BLOCK_HEX.finance})`,
  },
  { id: 'diary', label: 'calendar.legendDiary', swatch: BLOCK_HEX.diary },
  { id: 'health', label: 'calendar.legendHealth', swatch: BLOCK_HEX.health },
  { id: 'finance', label: 'calendar.legendFinance', swatch: BLOCK_HEX.finance },
]

function filterOf(value: string | null): CalendarFilter {
  return value === 'diary' || value === 'health' || value === 'finance' ? value : 'all'
}

export default function CalendarPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  const currentMonth = todayKey().slice(0, 7)
  const monthParam = params.get('month')
  const monthKey = isMonthKey(monthParam) ? monthParam : currentMonth
  const filter = filterOf(params.get('kind'))
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))

  const { from, to } = monthRange(monthKey)
  const activities = useLiveQuery(() => activityBetween(from, to), [from, to])
  const scheduleItems = useLiveQuery(() => schedules(), []) ?? []
  // 日程不参与三色混色：三色只表示「记了多少」，日程是有没有安排
  const scheduleDays = countByDay(scheduleItems, dateKeysOfMonth(monthKey))
  const cells = buildMonthGrid(monthKey, activities ?? [], filter)
  const hasAny = (activities ?? []).some((item) => item.dateKey.startsWith(`${monthKey}-`)) || scheduleDays.size > 0
  const today = todayKey()

  /** 换月 / 切图例都只改地址栏，页面其它状态不动 */
  function go(nextMonth: string, nextFilter: CalendarFilter) {
    const next: Record<string, string> = {}
    if (nextMonth !== currentMonth) next.month = nextMonth
    if (nextFilter !== 'all') next.kind = nextFilter
    setParams(next, { replace: true })
  }

  const swipe = useDaySwipe(
    () => go(shiftMonthKey(monthKey, -1), filter),
    () => go(shiftMonthKey(monthKey, 1), filter),
  )

  return (
    <div
      className={`mx-auto w-full max-w-2xl p-4 ${swipe.animationClass}`}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-1.5 text-lg font-medium text-fg">
          <Icon name="calendar" className="h-4 w-4 shrink-0" />
          {t('nav.calendar')}
        </h1>
      </header>

      <ViewTabs
        active="month"
        dayKey={monthKey === currentMonth ? today : `${monthKey}-15`}
      />

      {/* 月份栏：‹ 2026 年 11 月 › + 回到本月 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-line bg-surface px-1 py-0.5">
          <button
            type="button"
            onClick={() => go(shiftMonthKey(monthKey, -1), filter)}
            aria-label={t('calendar.prevMonth')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ‹
          </button>
          <span className="min-w-0 truncate px-2 text-sm font-medium text-fg">
            {t('calendar.month', { year, month })}
          </span>
          <button
            type="button"
            onClick={() => go(shiftMonthKey(monthKey, 1), filter)}
            aria-label={t('calendar.nextMonth')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ›
          </button>
        </div>
        {monthKey !== currentMonth && (
          <button
            type="button"
            onClick={() => go(currentMonth, filter)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-brand"
          >
            {t('calendar.today')}
          </button>
        )}
      </div>

      {/* 图例也是筛选：点一下只看某一块，颜色仍按这一块的条数深浅 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(monthKey, item.id)}
            aria-pressed={filter === item.id}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              filter === item.id
                ? 'border-brand text-brand'
                : 'border-line text-muted hover:text-fg',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: item.swatch }}
            />
            {t(item.label)}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {WEEKDAY_KEYS.map((key) => (
          <span key={key} className="py-1">
            {t(key)}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <Link
            key={cell.dateKey}
            to={`/day/${cell.dateKey}`}
            aria-label={t('calendar.openDay', { date: formatDate(cell.dateKey, t) })}
            style={cell.tint ? { backgroundColor: cell.tint } : undefined}
            className={[
              'relative flex aspect-square min-h-9 items-center justify-center rounded-xl border text-sm transition-colors',
              cell.inMonth
                ? 'border-line text-fg hover:border-brand'
                : 'border-transparent text-muted/50 hover:border-line',
              cell.dateKey === today ? 'ring-1 ring-brand' : '',
            ].join(' ')}
          >
            {cell.day}
            {cell.dateKey === today && cell.inMonth && (
              <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-brand" aria-hidden="true" />
            )}
            {/* 有日程的日子在底部点一个小标记，和「记录深浅」分开看 */}
            {cell.inMonth && (scheduleDays.get(cell.dateKey) ?? 0) > 0 && (
              <span
                className="absolute bottom-1 h-1 w-3 rounded-full bg-fg/60"
                aria-hidden="true"
              />
            )}
          </Link>
        ))}
      </div>

      {!hasAny ? (
        <p className="mt-4 text-center text-xs text-muted">{t('calendar.empty')}</p>
      ) : (
        <p className="mt-4 text-center text-xs text-muted">{t('calendar.hint')}</p>
      )}
    </div>
  )
}
