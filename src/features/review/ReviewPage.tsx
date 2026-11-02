/**
 * 月度回顾：把一个月的记录压成几个数字，再加一张每日记录小格。
 *
 * 不做图表库：这里要回答的是「这个月记了多少、花了多少、睡得怎样、
 * 哪些定期任务坚持住了」，用数字卡片和一条小格子最直接。
 */
import { Link, useSearchParams } from 'react-router'
import { useState } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { formatMonthDay, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import EmptyState from '@/shared/ui/EmptyState'
import { Icon } from '@/shared/ui/icons'
import AiReportDialog from '@/features/ai/AiReportDialog'
import ViewTabs from '@/features/calendar/ViewTabs'
import { activityBetween } from '@/features/calendar/calendarRepo'
import { isMonthKey, monthRange, shiftMonthKey } from '@/features/calendar/calendarData'
import { financeOfMonth } from '@/features/finance/financeRepo'
import { sleepsBetween } from '@/features/health/healthRepo'
import { trainingsBetween } from '@/features/training/trainingRepo'
import { sleepParts } from '@/features/health/sleepMath'
import { schedules } from '@/features/schedule/scheduleRepo'
import { dateKeysOfMonth } from '@/features/schedule/scheduleMath'
import {
  averageSleepMinutes,
  recordCountOf,
  scheduleProgress,
  summarizeMonth,
} from './reviewMath'

export default function ReviewPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  const [reportOpen, setReportOpen] = useState(false)

  const currentMonth = todayKey().slice(0, 7)
  const monthParam = params.get('month')
  const monthKey = isMonthKey(monthParam) ? monthParam : currentMonth
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const { from, to } = monthRange(monthKey)
  const today = todayKey()

  const activities = useLiveQuery(() => activityBetween(from, to), [from, to]) ?? []
  const finance = useLiveQuery(() => financeOfMonth(monthKey), [monthKey]) ?? []
  const sleeps = useLiveQuery(() => sleepsBetween(from, to), [from, to]) ?? []
  const trainings = useLiveQuery(() => trainingsBetween(from, to), [from, to]) ?? []
  const items = useLiveQuery(() => schedules(), []) ?? []

  const summary = summarizeMonth({ activities, finance, sleeps, trainings })
  const avgSleep = averageSleepMinutes(summary)
  const progress = scheduleProgress(items, monthKey, today)
  const days = dateKeysOfMonth(monthKey)
  const activityByDay = new Map(activities.map((item) => [item.dateKey, item]))
  // 定期任务的链接落在本月（看当月就落到今天，看旧月份落到 1 号）
  const scheduleAnchor = monthKey === currentMonth ? today : from
  const maxCount = Math.max(1, ...days.map((date) => recordCountOf(activityByDay.get(date))))
  // 7 列小格：按当月 1 号是周几补空位，和月历一样周一开头
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7

  const money = (value: number) =>
    `${t('finance.currency')}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`

  function goMonth(next: string) {
    setParams(next === currentMonth ? {} : { month: next }, { replace: true })
  }

  const empty = summary.daysWithRecords === 0 && progress.length === 0

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-1.5 text-lg font-medium text-fg">
          <Icon name="chart" className="h-4 w-4 shrink-0" />
          {t('review.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-brand px-2.5 py-1 text-xs text-brand transition-colors hover:bg-surface-2"
          >
            <Icon name="sparkles" className="h-3.5 w-3.5 shrink-0" />
            {t('ai.reportMonthly')}
          </button>
        </div>
      </header>

      <ViewTabs active="review" dayKey={scheduleAnchor} />

      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-line bg-surface px-1 py-0.5">
          <button
            type="button"
            onClick={() => goMonth(shiftMonthKey(monthKey, -1))}
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
            onClick={() => goMonth(shiftMonthKey(monthKey, 1))}
            aria-label={t('calendar.nextMonth')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ›
          </button>
        </div>
        {monthKey !== currentMonth && (
          <button
            type="button"
            onClick={() => goMonth(currentMonth)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-brand"
          >
            {t('calendar.today')}
          </button>
        )}
      </div>

      {empty ? (
        <div className="mt-6">
          <EmptyState icon="📊" text={t('review.empty')} />
        </div>
      ) : (
        <>
          {/* 概览：记录天数 / 文字条数 / 收支 / 睡眠 / 训练 */}
          <section className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.daysWithRecords')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">
                {t('review.daysValue', { done: summary.daysWithRecords, total: days.length })}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.writing')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">
                {t('review.timesValue', { n: summary.entries + summary.stamps })}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.expense')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">{money(summary.expense)}</div>
              <div className="mt-0.5 text-[11px] text-muted">
                {t('review.incomeLine', { value: money(summary.income) })}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.avgSleep')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">
                {avgSleep === null
                  ? '—'
                  : (() => {
                      const parts = sleepParts(avgSleep)
                      return t('health.sleepDuration', { h: parts.h, m: parts.m })
                    })()}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {t('review.sleepNights', { n: summary.sleepNights })}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.training')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">
                {t('review.trainingValue', {
                  n: summary.trainingSessions,
                  m: summary.trainingMinutes,
                })}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] text-muted">{t('review.intake')}</div>
              <div className="mt-0.5 text-lg font-medium text-fg">
                {t('review.timesValue', { n: summary.intakes })}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {t('review.weighInsLine', { n: summary.weighIns })}
              </div>
            </div>
          </section>

          {/* 每日记录小格：周一开头，颜色越深记录越多 */}
          <section className="mt-4 rounded-xl border border-line bg-surface p-3">
            <div className="text-xs font-medium text-muted">{t('review.daily')}</div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {Array.from({ length: offset }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {days.map((date) => {
                const count = recordCountOf(activityByDay.get(date))
                const alpha = count === 0 ? 0 : 0.16 + 0.72 * (count / maxCount)
                return (
                  <Link
                    key={date}
                    to={`/day/${date}`}
                    aria-label={t('calendar.openDay', { date })}
                    title={t('review.dayCount', { date: formatMonthDay(date, t), n: count })}
                    style={count > 0 ? { backgroundColor: `rgb(16 185 129 / ${alpha.toFixed(2)})` } : undefined}
                    className="flex aspect-square items-center justify-center rounded-md border border-line text-[10px] text-muted transition-colors hover:border-brand"
                  >
                    {Number(date.slice(8, 10))}
                  </Link>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">{t('review.dailyHint')}</p>
          </section>

          {/* 定期任务：完成率与连续次数 */}
          <section className="mt-4">
            <h2 className="mb-2 text-xs font-medium text-muted">{t('review.schedules')}</h2>
            {progress.length === 0 ? (
              <EmptyState icon="🔁" text={t('review.schedulesEmpty')} />
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0">
                {progress.map((row) => {
                  const ratio = row.total > 0 ? row.done / row.total : 0
                  return (
                    <li key={row.item.id} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/schedule?date=${scheduleAnchor}`}
                          className="min-w-0 flex-1 truncate text-sm text-fg"
                        >
                          {row.item.title}
                        </Link>
                        <span className="shrink-0 text-[11px] text-muted">
                          {t('review.scheduleRow', {
                            done: row.done,
                            total: row.total,
                            streak: row.streak,
                          })}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {reportOpen && (
        <AiReportDialog
          period={{
            kind: 'month',
            from,
            to,
            label: t('calendar.month', { year, month }),
          }}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}
