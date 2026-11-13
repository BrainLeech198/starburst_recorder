/**
 * 一天一页：把这一天散在四块里的记录按时间排成一条时间轴。
 *
 * 从日历点进来（`/day/YYYY-MM-DD`），日期栏还能左右换天。
 * 每条都链回原来的页面：日记进编辑页，随记 / 收支 / 睡眠 / 训练 / 饮食 / 称重
 * 回到各自带 `?date=` 的页面。这里只读汇总，不在这里改数据。
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useLiveQuery } from '@/core/db/live'
import { formatClock, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import EmptyState from '@/shared/ui/EmptyState'
import DayNav from '@/shared/ui/DayNav'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { NAV_BACK_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon, type IconName } from '@/shared/ui/icons'
import { briefEntriesOfDay, briefStampsOfDay } from '@/features/diary/diaryRepo'
import { stripImageTokens } from '@/features/diary/imageTokens'
import { healthProfile, intakesOfDay, sleepOfDay } from '@/features/health/healthRepo'
import { sleepMinutes, sleepParts } from '@/features/health/sleepMath'
import { trainingOfDay } from '@/features/training/trainingRepo'
import { categoryKey } from '@/features/finance/financeCategories'
import { financeBriefsOfMonth } from '@/features/finance/financeRepo'
import { schedules } from '@/features/schedule/scheduleRepo'
import { isDoneOn, occurrencesOn } from '@/features/schedule/scheduleMath'
import DatePickerDialog from '@/features/diary/DatePickerDialog'

type TimelineKind =
  | 'diary'
  | 'stamp'
  | 'finance'
  | 'sleep'
  | 'training'
  | 'intake'
  | 'weight'
  | 'schedule'

interface TimelineItem {
  key: string
  /** 排序用的 'HH:MM' */
  time: string
  kind: TimelineKind
  label: MessageKey
  title: string
  detail?: string
  to: string
}

/** 每类记录一个基色，和日历的三色图例对得上 */
const KIND_COLOR: Record<TimelineKind, string> = {
  diary: '#ea580c',
  stamp: '#ea580c',
  finance: '#3b82f6',
  sleep: '#10b981',
  training: '#10b981',
  intake: '#10b981',
  weight: '#10b981',
  schedule: '#a855f7',
}

const KIND_ICON: Record<TimelineKind, IconName> = {
  diary: 'book',
  stamp: 'edit',
  finance: 'wallet',
  sleep: 'bed',
  training: 'dumbbell',
  intake: 'utensils',
  weight: 'scale',
  schedule: 'calendar',
}

function snippet(text: string): string {
  const plain = stripImageTokens(text).trim().replace(/\s+/g, ' ')
  return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain
}

export default function DayPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const dayKey = isDateKey(params.date) ? params.date : todayKey()
  const [pickerOpen, setPickerOpen] = useState(false)

  const data = useLiveQuery(async () => {
    const monthKey = dayKey.slice(0, 7)
    const [entries, stamps, intakes, sleep, trainings, finance, profile, scheduleItems] =
      await Promise.all([
        briefEntriesOfDay(dayKey),
        briefStampsOfDay(dayKey),
        intakesOfDay(dayKey),
        sleepOfDay(dayKey),
        trainingOfDay(dayKey),
        financeBriefsOfMonth(monthKey),
        healthProfile(),
        schedules(),
      ])
    return {
      entries,
      stamps,
      intakes,
      sleep: sleep ?? null,
      trainings,
      finance: finance.filter((item) => item.dateKey === dayKey),
      weighIns: (profile?.weighIns ?? []).filter((item) => item.dateKey === dayKey),
      schedules: occurrencesOn(scheduleItems, dayKey),
    }
  }, [dayKey])

  const view = data ?? {
    entries: [],
    stamps: [],
    intakes: [],
    sleep: null,
    trainings: [],
    finance: [],
    weighIns: [],
    schedules: [],
  }

  const money = (value: number) =>
    `${t('finance.currency')}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`

  const items: TimelineItem[] = [
    ...view.entries.map((entry) => ({
      key: `entry-${entry.id}`,
      time: formatClock(entry.createdAt),
      kind: 'diary' as const,
      label: 'day.diary' as const,
      title: snippet(entry.content) || t('diary.imageOnly'),
      detail: entry.tags.length > 0 ? entry.tags.map((tag) => `#${tag}`).join(' ') : undefined,
      to: `/diary/${entry.code}`,
    })),
    ...view.stamps.map((stamp) => ({
      key: `stamp-${stamp.id}`,
      time: stamp.time,
      kind: 'stamp' as const,
      label: 'day.stamp' as const,
      title: snippet(stamp.content) || t('diary.imageOnly'),
      detail: stamp.tags.length > 0 ? stamp.tags.map((tag) => `#${tag}`).join(' ') : undefined,
      to: `/diary?date=${dayKey}`,
    })),
    ...view.finance.map((entry) => ({
      key: `finance-${entry.id}`,
      time: entry.time.slice(0, 5),
      kind: 'finance' as const,
      label: 'day.finance' as const,
      title: `${entry.name || t('finance.uncategorized')} · ${
        entry.kind === 'income' ? '+' : '-'
      }${money(entry.amount)}`,
      detail: t(categoryKey(entry.category)),
      to: `/finance?month=${dayKey.slice(0, 7)}`,
    })),
    ...view.intakes.map((intake) => ({
      key: `intake-${intake.id}`,
      time: intake.time,
      kind: 'intake' as const,
      label: 'day.intake' as const,
      title: intake.name,
      detail: `${intake.kcal} kcal`,
      to: `/health/intakes?date=${dayKey}`,
    })),
    ...view.trainings.map((training) => ({
      key: `training-${training.id}`,
      time: training.time,
      kind: 'training' as const,
      label: 'day.training' as const,
      title: training.title || t(('training.kind.' + training.kind) as MessageKey),
      detail:
        training.durationMin !== null ? `${training.durationMin} min` : undefined,
      to: `/training?date=${dayKey}`,
    })),
    ...(view.sleep
      ? [
          {
            key: `sleep-${view.sleep.id}`,
            time: view.sleep.bedtime,
            kind: 'sleep' as const,
            label: 'day.sleep' as const,
            title: `${view.sleep.bedtime}–${view.sleep.wakeTime}`,
            detail: (() => {
              const parts = sleepParts(sleepMinutes(view.sleep!.bedtime, view.sleep!.wakeTime))
              return t('health.sleepDuration', { h: parts.h, m: parts.m })
            })(),
            to: `/health/sleeps?date=${dayKey}`,
          },
        ]
      : []),
    ...view.weighIns.map((item) => ({
      key: `weight-${item.createdAt}`,
      time: formatClock(item.createdAt),
      kind: 'weight' as const,
      label: 'day.weighIn' as const,
      title: `${item.weightKg} kg`,
      to: `/health/weights?date=${dayKey}`,
    })),
    ...view.schedules.map((item) => ({
      key: `schedule-${item.id}`,
      time: item.time,
      kind: 'schedule' as const,
      label: 'day.schedule' as const,
      title: isDoneOn(item, dayKey) ? `✓ ${item.title}` : item.title,
      detail: item.note || undefined,
      to: `/schedule?date=${dayKey}`,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time))

  const expense = view.finance
    .filter((item) => item.kind === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)
  const sleepTotal = view.sleep
    ? sleepParts(sleepMinutes(view.sleep.bedtime, view.sleep.wakeTime))
    : null

  // 换天用 replace：和健康 / 训练页一样，翻几天不会把返回栈堆满
  function goToDay(next: string) {
    navigate(`/day/${next}`, { replace: true })
  }

  const swipe = useDaySwipe(
    () => goToDay(shiftDay(dayKey, -1)),
    () => goToDay(shiftDay(dayKey, 1)),
  )

  return (
    <div
      className={`mx-auto w-full max-w-2xl p-4 ${swipe.animationClass}`}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      <DayNav
        dayKey={dayKey}
        onChange={goToDay}
        onPick={() => setPickerOpen(true)}
        labels={{
          prev: t('health.prevDay'),
          next: t('health.nextDay'),
          pick: t('health.pickDate'),
          today: t('health.backToToday'),
        }}
        leading={
          <Link to={`/calendar?month=${dayKey.slice(0, 7)}`} className={NAV_BACK_BUTTON}>
            <Icon name="back" className="h-3.5 w-3.5 shrink-0" />
            {t('nav.calendar')}
          </Link>
        }
        trailing={
          <Link
            to={`/week/${dayKey}`}
            className="inline-flex h-8 shrink-0 items-center rounded-lg border border-line px-2.5 text-xs text-muted transition-colors hover:text-brand"
          >
            {t('week.title')}
          </Link>
        }
      />

      {/* 当日汇总：条数 / 支出 / 睡眠，三块各一句 */}
      <section className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <div className="text-[11px] text-muted">{t('day.records')}</div>
          <div className="mt-0.5 text-base font-medium text-fg">{items.length}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <div className="text-[11px] text-muted">{t('day.expense')}</div>
          <div className="mt-0.5 truncate text-base font-medium text-fg">{money(expense)}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <div className="text-[11px] text-muted">{t('day.sleepTotal')}</div>
          <div className="mt-0.5 text-base font-medium text-fg">
            {sleepTotal
              ? t('health.sleepDuration', { h: sleepTotal.h, m: sleepTotal.m })
              : '—'}
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="📅" text={t('day.empty')} />
        </div>
      ) : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2 transition-colors hover:border-brand"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    color: KIND_COLOR[item.kind],
                    backgroundColor: `${KIND_COLOR[item.kind]}1a`,
                  }}
                >
                  <Icon name={KIND_ICON[item.kind]} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="font-medium" style={{ color: KIND_COLOR[item.kind] }}>
                      {t(item.label)}
                    </span>
                    <span>{item.time}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-fg">{item.title}</div>
                  {item.detail && (
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{item.detail}</div>
                  )}
                </div>
                <Icon name="arrow-right" className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ol>
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dayKey}
          onConfirm={(next) => {
            setPickerOpen(false)
            goToDay(next)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
