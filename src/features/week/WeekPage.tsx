/**
 * 周视图：把一周七天的安排与记录摊成一列，适合「这周还剩什么」。
 *
 * 月历看整体深浅，一天一页看细节，这一页夹在中间：
 * 每天一行，先列当天的日程（可勾完成），再给三块记录的条数；
 * 点日期进一天一页，点日程进日程页，也可以直接在这一天加一条。
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { ScheduleItem } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatMonthDay, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { Icon } from '@/shared/ui/icons'
import AiReportDialog from '@/features/ai/AiReportDialog'
import { activityBetween } from '@/features/calendar/calendarRepo'
import { financeOfMonth } from '@/features/finance/financeRepo'
import { donePatch, isDoneOn, occurrencesOn } from '@/features/schedule/scheduleMath'
import { saveSchedule, schedules } from '@/features/schedule/scheduleRepo'
import ScheduleDialog from '@/features/schedule/ScheduleDialog'
import { isThisWeek, shiftWeek, weekDates, weekRange } from './weekMath'

const WEEKDAY_KEYS: MessageKey[] = [
  'date.weekdayShort1',
  'date.weekdayShort2',
  'date.weekdayShort3',
  'date.weekdayShort4',
  'date.weekdayShort5',
  'date.weekdayShort6',
  'date.weekdayShort0',
]

export default function WeekPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const params = useParams()
  const dayKey = isDateKey(params.date) ? params.date : todayKey()
  const today = todayKey()
  const days = weekDates(dayKey)
  const { from, to } = weekRange(dayKey)

  const activities = useLiveQuery(() => activityBetween(from, to), [from, to]) ?? []
  const items = useLiveQuery(() => schedules(), []) ?? []
  // 一周可能跨月：两个月的流水各取一次，再按本周筛
  const money = useLiveQuery(async () => {
    const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])]
    const lists = await Promise.all(months.map((month) => financeOfMonth(month)))
    return lists.flat().filter((item) => item.dateKey >= from && item.dateKey <= to)
  }, [from, to]) ?? []

  const [dialogDate, setDialogDate] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const activityByDay = new Map(activities.map((item) => [item.dateKey, item]))
  const expenseByDay = new Map<string, number>()
  for (const item of money) {
    if (item.kind !== 'expense') continue
    expenseByDay.set(item.dateKey, (expenseByDay.get(item.dateKey) ?? 0) + item.amount)
  }

  const totalRecords = activities.reduce(
    (sum, item) => sum + item.entries + item.stamps + item.intakes + item.sleeps + item.trainings + item.finance,
    0,
  )
  const totalExpense = [...expenseByDay.values()].reduce((sum, value) => sum + value, 0)
  // 定期任务一周可能出现多次，按「日期 + 条目」逐次算完成
  const weekOccurrences = days.flatMap((date) =>
    occurrencesOn(items, date).map((item) => ({ date, item })),
  )
  const doneCount = weekOccurrences.filter(({ date, item }) => isDoneOn(item, date)).length

  function currency(value: number) {
    return `${t('finance.currency')}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`
  }

  async function toggleDone(item: ScheduleItem, date: string) {
    await saveSchedule({ ...item, ...donePatch(item, date, !isDoneOn(item, date)) })
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-1.5 text-lg font-medium text-fg">
          <Icon name="calendar" className="h-4 w-4 shrink-0" />
          {t('week.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-brand px-2.5 py-1 text-xs text-brand transition-colors hover:bg-surface-2"
          >
            <Icon name="sparkles" className="h-3.5 w-3.5 shrink-0" />
            {t('ai.reportWeekly')}
          </button>
          <Link
            to={`/calendar?month=${dayKey.slice(0, 7)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-brand"
          >
            <Icon name="arrow-right" className="h-3.5 w-3.5 shrink-0" />
            {t('week.monthView')}
          </Link>
        </div>
      </header>

      {/* 周导航：‹ 11/02 – 11/08 › + 回到本周 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-line bg-surface px-1 py-0.5">
          <button
            type="button"
            onClick={() => navigate(`/week/${shiftWeek(dayKey, -1)}`, { replace: true })}
            aria-label={t('week.prev')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ‹
          </button>
          <span className="min-w-0 truncate px-2 text-sm font-medium text-fg">
            {t('week.range', { from: formatMonthDay(from, t), to: formatMonthDay(to, t) })}
          </span>
          <button
            type="button"
            onClick={() => navigate(`/week/${shiftWeek(dayKey, 1)}`, { replace: true })}
            aria-label={t('week.next')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ›
          </button>
        </div>
        {!isThisWeek(dayKey, today) && (
          <button
            type="button"
            onClick={() => navigate(`/week/${today}`)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-brand"
          >
            {t('week.thisWeek')}
          </button>
        )}
      </div>

      {/* 本周小计 */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface px-2 py-1">
          {t('week.records', { n: totalRecords })}
        </span>
        <span className="rounded-full bg-surface px-2 py-1">
          {t('week.expense', { value: currency(totalExpense) })}
        </span>
        <span className="rounded-full bg-surface px-2 py-1">
          {t('week.done', { done: doneCount, total: weekOccurrences.length })}
        </span>
      </div>

      <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {days.map((date, index) => {
          const row = activityByDay.get(date)
          const daySchedules = occurrencesOn(items, date)
          const expense = expenseByDay.get(date) ?? 0
          const records = row
            ? row.entries + row.stamps + row.intakes + row.sleeps + row.trainings + row.finance
            : 0
          const isToday = date === today
          return (
            <li
              key={date}
              className={[
                'rounded-2xl border bg-surface p-3',
                isToday ? 'border-brand' : 'border-line',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <Link to={`/day/${date}`} className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-[10px] leading-tight',
                      isToday ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted',
                    ].join(' ')}
                  >
                    <span>{t(WEEKDAY_KEYS[index])}</span>
                    <span className="text-sm font-medium">{Number(date.slice(8, 10))}</span>
                  </span>
                  <span className="truncate text-sm text-fg">{formatMonthDay(date, t)}</span>
                </Link>
                <span className="ml-auto text-[11px] text-muted">
                  {expense > 0 ? t('week.dayExpense', { value: currency(expense) }) : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setDialogDate(date)}
                  aria-label={t('week.addHere', { date: formatMonthDay(date, t) })}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-brand"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>

              {daySchedules.length > 0 && (
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {daySchedules.map((item) => {
                    const done = isDoneOn(item, date)
                    return (
                      <li key={item.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleDone(item, date)}
                          aria-pressed={done}
                          aria-label={done ? t('schedule.markUndone') : t('schedule.markDone')}
                          className={[
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            done ? 'border-brand bg-brand text-on-brand' : 'border-line text-transparent',
                          ].join(' ')}
                        >
                          <Icon name="check" className="h-2.5 w-2.5" />
                        </button>
                        <Link
                          to={`/schedule?date=${date}`}
                          className={[
                            'min-w-0 flex-1 truncate text-xs',
                            done ? 'text-muted line-through' : 'text-fg',
                          ].join(' ')}
                        >
                          {item.time && <span className="mr-1.5 text-muted">{item.time}</span>}
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}

              {records > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                  {row && row.entries + row.stamps > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">
                      {t('week.diaryCount', { n: row.entries + row.stamps })}
                    </span>
                  )}
                  {row &&
                    row.intakes + row.sleeps + row.trainings + row.weighIns > 0 && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5">
                        {t('week.healthCount', {
                          n: row.intakes + row.sleeps + row.trainings + row.weighIns,
                        })}
                      </span>
                    )}
                  {row && row.finance > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">
                      {t('week.financeCount', { n: row.finance })}
                    </span>
                  )}
                </div>
              )}

              {daySchedules.length === 0 && records === 0 && (
                <p className="m-0 mt-2 text-xs text-muted">{t('week.emptyDay')}</p>
              )}
            </li>
          )
        })}
      </ol>

      {dialogDate && (
        <ScheduleDialog
          value={null}
          defaultDate={dialogDate}
          onCancel={() => setDialogDate(null)}
          onSave={(item) => {
            void saveSchedule(item)
            setDialogDate(null)
            showToast({ message: t('schedule.saved') })
          }}
        />
      )}
      {reportOpen && (
        <AiReportDialog
          period={{
            kind: 'week',
            from,
            to,
            label: t('week.range', { from: formatMonthDay(from, t), to: formatMonthDay(to, t) }),
          }}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}
