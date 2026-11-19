import type { PostcardFact } from '@/features/share/AchievementPostcardDialog'
import type { ScheduleProgress, MonthSummary } from './reviewMath'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { isDoneOn, occursOn, dateKeysOfMonth } from '@/features/schedule/scheduleMath'
import { averageSleepMinutes } from './reviewMath'
import { sleepParts } from '@/features/health/sleepMath'

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** Build a concise monthly postcard; sensitive summaries are opt-in and start hidden. */
export function reviewPostcardFacts(
  summary: MonthSummary,
  schedules: ScheduleProgress[],
  monthKey: string,
  today: string,
  t: Translate,
  money: (value: number) => string,
): PostcardFact[] {
  const monthDates = dateKeysOfMonth(monthKey)
  const through = monthDates.filter((date) => date <= today)
  const scheduleTotal = schedules.reduce(
    (count, row) => count + through.filter((date) => occursOn(row.item, date)).length,
    0,
  )
  const scheduleDone = schedules.reduce(
    (count, row) => count + through.filter((date) => occursOn(row.item, date) && isDoneOn(row.item, date)).length,
    0,
  )

  const facts: PostcardFact[] = [
    {
      id: 'days',
      label: t('review.daysWithRecords'),
      value: t('review.daysValue', { done: summary.daysWithRecords, total: through.length }),
    },
    {
      id: 'writing',
      label: t('review.writing'),
      value: t('review.timesValue', { n: summary.entries + summary.stamps }),
    },
  ]
  if (scheduleTotal > 0) {
    facts.push({ id: 'schedule', label: t('review.schedules'), value: `${scheduleDone}/${scheduleTotal}` })
  }
  if (summary.trainingSessions > 0) {
    facts.push({
      id: 'training',
      label: t('review.training'),
      value: t('review.trainingValue', { n: summary.trainingSessions, m: summary.trainingMinutes }),
    })
  }

  const avgSleep = averageSleepMinutes(summary)
  if (avgSleep !== null) {
    const parts = sleepParts(avgSleep)
    facts.push({
      id: 'sleep',
      label: t('review.avgSleep'),
      value: `${t('health.sleepDuration', { h: parts.h, m: parts.m })} · ${t('review.sleepNights', { n: summary.sleepNights })}`,
      optional: true,
      includedByDefault: false,
    })
  }
  if (summary.financeRecords > 0) {
    facts.push({
      id: 'finance',
      label: t('review.expense'),
      value: `${money(summary.expense)} · ${t('review.incomeLine', { value: money(summary.income) })}`,
      optional: true,
      includedByDefault: false,
    })
  }
  return facts
}
