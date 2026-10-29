import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import {
  formatDate,
  isDateKey,
  relativeDayKey,
  shiftDay,
  todayKey,
  weekdayKey,
} from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import IntakeBar, { ProteinBar } from './IntakeBar'
import WeighInCard from './WeighInCard'
import SleepBar from './SleepBar'
import { intakeReviewKey, sleepReviewKey } from './healthViz'
import { useDerivedTdee } from './useDerivedTdee'
import { maybeNotifyWeighDay, syncWeighReminder } from './weighNotify'
import SleepDialog from './SleepDialog'
import { sleepMinutes, sleepParts } from './sleepMath'
import IntakeDialog from './IntakeDialog'
import { dayTargets, formatNum, missingProfileFields, remainingKcal, sumMacros } from './healthMath'
import { healthProfile, intakeDays, intakesOfDay, sleepDays, sleepOfDay } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'

const FIELD_LABELS = {
  sex: 'profile.fieldSex',
  age: 'profile.fieldAge',
  heightCm: 'profile.fieldHeight',
  weightKg: 'profile.fieldWeight',
  tdee: 'profile.fieldTdee',
  targetKcal: 'profile.fieldTarget',
} as const

/** 健康首页：一条今日摄入进度条 +「记一笔」，其余留白，等训练和体重再接 */
export default function HealthPage() {
  const { t } = useI18n()
  // 跟日记一样把日期放进 URL：刷新、返回都还停在看的这一天
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()
  const isToday = dayKey === todayKey()

  function setDayKey(next: string) {
    setSearchParams({ date: next }, { replace: true })
  }

  const profile = useLiveQuery(() => healthProfile(), [])
  const intakes = useLiveQuery(() => intakesOfDay(dayKey), [dayKey])
  const [dialogOpen, setDialogOpen] = useState(false)
  /** 这一夜的睡眠；null = 没记，undefined = 还在查 */
  const sleep = useLiveQuery(async () => (await sleepOfDay(dayKey)) ?? null, [dayKey])
  const derivedTdee = useDerivedTdee(profile)
  // 称重日提醒：应用内横幅由 WeighInCard 负责，这里补系统通知（桌面到点弹、安卓排本地通知）
  useEffect(() => {
    maybeNotifyWeighDay(profile)
    void syncWeighReminder(profile)
  }, [profile])
  const [sleepDialogOpen, setSleepDialogOpen] = useState(false)
  /** 日历打开时标亮的日期：记过摄入或睡眠的那些天 */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())

  async function openPicker() {
    setWrittenDays(new Set([...(await intakeDays()), ...(await sleepDays())]))
    setPickerOpen(true)
  }

  const missing = missingProfileFields(profile)
  const ready = missing.length === 0
  const totals = sumMacros(intakes ?? [])
  // 今天跟着当前档案走（改了档案今天的线立刻改）；过去的日子按当天第一笔的快照
  const targets = dayTargets(intakes ?? [], profile, isToday)
  const remaining = remainingKcal(targets.targetKcal, totals.kcal)
  const intakeReview = intakeReviewKey(totals.kcal, targets.targetKcal)
  const sleepReview =
    sleep === null || sleep === undefined
      ? null
      : sleepReviewKey(sleepMinutes(sleep.bedtime, sleep.wakeTime), sleep.quality)
  const fieldNames = missing
    .map((key) => t(FIELD_LABELS[key as keyof typeof FIELD_LABELS]))
    .join(' / ')

  return (
    <div className="w-full p-4">
      {/* 第一行只放页面级入口；「记一笔」是当天卡片自己的操作，留在卡片里 */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* 日期导航优先：窄屏时右侧入口整体换到下一行，而不是把日期挤成省略号 */}
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDayKey(shiftDay(dayKey, -1))}
            aria-label={t('health.prevDay')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ‹
          </button>

          {/* 日期本身就是日期选择入口，跟日记一致 */}
          <button
            type="button"
            onClick={() => void openPicker()}
            aria-label={t('health.pickDate')}
            className="font-hand flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
          >
            {/* 今天绿、其他日期黄：跟日记一致，一眼知道在看哪一天 */}
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
              onClick={() => {
                setSearchParams({}, { replace: true })
              }}
              className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('health.backToToday')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setDayKey(shiftDay(dayKey, 1))}
            aria-label={t('health.nextDay')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
          >
            ›
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            to="/health/foods"
            className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted transition-colors hover:text-fg"
          >
            {t('health.foods')}
          </Link>
          <Link
            to="/health/profile"
            aria-label={t('health.profile')}
            title={t('health.profile')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden="true">⚙</span>
          </Link>
        </div>
      </header>

      {!ready && (
        <section className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="m-0 text-sm text-fg">{t('health.setupNeeded')}</p>
          <p className="m-0 mt-1 text-xs text-muted">
            {t('health.setupMissing', { fields: fieldNames })}
          </p>
          <Link to="/health/profile" className={`${OUTLINE_BUTTON} mt-3`}>
            {t('health.setupAction')}
          </Link>
        </section>
      )}

      {ready && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span aria-hidden="true" className="mt-1 h-4 w-1 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0">
                <h2 className="m-0 text-base font-semibold leading-tight text-fg">
                  {t('records.kindIntake')}
                </h2>
                <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
                  {isToday ? t('health.today') : formatDate(dayKey, t)}
                </p>
              </div>
            </div>
          </div>
          {intakeReview && (
            <p className="m-0 mt-3 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
              {t(intakeReview)}
            </p>
          )}
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="m-0 text-3xl font-medium tabular-nums text-fg">
                {formatNum(totals.kcal)}
                <span className="ml-1 text-xs font-normal text-muted">{t('health.kcalUnit')}</span>
              </p>
            </div>
            <div className="text-right text-xs">
              {remaining !== null && (
                <p className={`m-0 ${remaining >= 0 ? 'text-muted' : 'text-danger'}`}>
                  {remaining >= 0
                    ? t('health.remaining', { value: formatNum(remaining) })
                    : t('health.over', { value: formatNum(Math.abs(remaining)) })}
                </p>
              )}
            </div>
          </div>

          <IntakeBar
            totals={totals}
            tdee={targets.tdee}
            target={targets.targetKcal}
            derived={derivedTdee ?? null}
          />
          <ProteinBar value={totals.protein} target={targets.proteinTarget} />

          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={`${SOLID_BUTTON} w-full`}
            >
              {t('health.addIntake')}
            </button>
            {/* 明细、批量、回收站都在「摄入记录」页，卡片只留概览和入口 */}
            <Link to={`/health/intakes?date=${dayKey}`} className={OUTLINE_BUTTON + ' w-full'}>
              {t('health.viewRecords')}
              {intakes !== undefined && intakes.length > 0
                ? ` · ${t('health.itemCount', { n: intakes.length })}`
                : ''}
            </Link>
          </div>
        </section>
      )}

      {/* 每周空腹称重：设称重日、记体重、看推算 TDEE */}
      <div className="mt-4">
        <WeighInCard profile={profile} derived={derivedTdee} />
      </div>

      {/* 睡眠：一夜一行，dateKey = 起床那天；跟摄入互不相干，档案没填也能记 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 h-4 w-1 shrink-0 rounded-full bg-brand" />
            <div className="min-w-0">
              <h2 className="m-0 text-base font-semibold leading-tight text-fg">
                {t('health.sleepTitle')}
              </h2>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
                {t('health.sleepDateHint', { date: formatDate(dayKey, t) })}
              </p>
            </div>
          </div>
          {/* 删除、回收站、理想作息都在「睡眠记录」页 */}
          <Link
            to={`/health/sleeps?date=${dayKey}`}
            className="shrink-0 text-xs text-muted transition-colors hover:text-brand"
          >
            {t('health.viewRecords')} ›
          </Link>
        </div>
        {sleep === undefined ? null : sleep === null ? (
          <>
            <p className="m-0 mt-3 text-xs text-muted">
              {isToday
                ? t('health.sleepEmpty')
                : t('health.sleepEmptyDay', { date: formatDate(dayKey, t) })}
            </p>
            <button
              type="button"
              onClick={() => setSleepDialogOpen(true)}
              className={SOLID_BUTTON + ' mt-3 w-full'}
            >
              {t('health.sleepAdd')}
            </button>
          </>
        ) : (
          <div className="mt-3">
            {sleepReview && (
              <p className="m-0 mb-3 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
                {t(sleepReview)}
              </p>
            )}
            <p className="m-0 text-3xl font-medium tabular-nums text-fg">
              {t('health.sleepDuration', sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime)))}
            </p>
            <p className="m-0 mt-1 text-xs tabular-nums text-muted">
              {sleep.bedtime} → {sleep.wakeTime}
              {sleep.quality !== null && (
                <span className="ml-2 text-warning">{'★'.repeat(sleep.quality)}</span>
              )}
            </p>
            <SleepBar
              sleep={sleep}
              idealBedtime={profile?.idealBedtime ?? '23:00'}
              idealWakeTime={profile?.idealWakeTime ?? '07:00'}
            />
            {sleep.note !== '' && <p className="m-0 mt-2 text-xs text-fg">{sleep.note}</p>}
            <button
              type="button"
              onClick={() => setSleepDialogOpen(true)}
              className={OUTLINE_BUTTON + ' mt-3 w-full'}
            >
              {t('health.sleepEdit')}
            </button>
          </div>
        )}
      </section>

      {dialogOpen && (
        <IntakeDialog
          dateKey={dayKey}
          intakes={intakes ?? []}
          derived={derivedTdee ?? null}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {sleepDialogOpen && (
        <SleepDialog
          dateKey={dayKey}
          sleep={sleep ?? null}
          onClose={() => setSleepDialogOpen(false)}
        />
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dayKey}
          highlightDays={writtenDays}
          onConfirm={(next) => {
            setPickerOpen(false)
            setDayKey(next)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
