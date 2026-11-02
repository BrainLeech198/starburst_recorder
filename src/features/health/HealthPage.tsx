import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import DayNav from '@/shared/ui/DayNav'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { useI18n } from '@/shared/i18n/context'
import { INPUT } from '@/shared/ui/inputStyles'
import { Icon } from '@/shared/ui/icons'
import { OUTLINE_BUTTON, SOLID_BUTTON, SOLID_SMALL_BUTTON } from '@/shared/ui/buttonStyles'
import type { HealthProfile } from '@/core/db/schema'
import IntakeBar, { ProteinBar } from './IntakeBar'
import WeighInCard from './WeighInCard'
import SleepBar from './SleepBar'
import { intakeReviewKey, sleepReviewKey, sleepWakeMessage } from './healthViz'
import { useDerivedTdee } from './useDerivedTdee'
import { maybeNotifyWeighDay, syncWeighReminder } from './weighNotify'
import SleepDialog from './SleepDialog'
import HealthDeviceImportDialog from './HealthDeviceImportDialog'
import { canImportFromHealthApp } from './deviceHealth'
import { sleepMinutes, sleepParts, sleepWakeStats, sortWakeEvents } from './sleepMath'
import IntakeDialog from './IntakeDialog'
import HealthEstimateNote, { HealthDisclaimerDialog } from './HealthDisclaimer'
import { hasAcknowledgedDisclaimer } from './disclaimerAck'
import { dayTargets, emptyProfile, formatNum, missingProfileFields, remainingKcal, sumMacros } from './healthMath'
import { healthProfile, intakeDays, intakesOfDay, saveHealthProfile, sleepDays, sleepOfDay } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import { trainingOfDay, trainingsBetween, latestTraining } from '@/features/training/trainingRepo'
import {
  daysBetween,
  formatDuration,
  formatVolume,
  summarizeDay,
  summarizeWeek,
  weekStartOf,
} from '@/features/training/trainingMath'
import { maybeNotifyTraining, syncTrainingReminder } from '@/features/training/trainingNotify'
import TrainingForm from '@/features/training/TrainingForm'

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
  const swipe = useDaySwipe(
    () => setDayKey(shiftDay(dayKey, -1)),
    () => setDayKey(shiftDay(dayKey, 1)),
  )

  const profile = useLiveQuery(() => healthProfile(), [])
  const intakes = useLiveQuery(() => intakesOfDay(dayKey), [dayKey])
  const [dialogOpen, setDialogOpen] = useState(false)
  // 第一次进健康页先说明「这些数字都是估算」，确认过就不再弹
  const [disclaimerOpen, setDisclaimerOpen] = useState(() => !hasAcknowledgedDisclaimer())
  /** 这一夜的睡眠；null = 没记，undefined = 还在查 */
  const sleep = useLiveQuery(async () => (await sleepOfDay(dayKey)) ?? null, [dayKey])
  // 训练卡：当天记录 + 本周汇总，点卡片进训练页
  const trainings = useLiveQuery(() => trainingOfDay(dayKey), [dayKey])
  const trainingWeekStart = weekStartOf(dayKey)
  const trainingWeek = useLiveQuery(
    () => trainingsBetween(trainingWeekStart, shiftDay(trainingWeekStart, 6)),
    [trainingWeekStart],
  )
  const derivedTdee = useDerivedTdee(profile)
  // 称重日提醒：应用内横幅由 WeighInCard 负责，这里补系统通知（桌面到点弹、安卓排本地通知）
  useEffect(() => {
    maybeNotifyWeighDay(profile)
    void syncWeighReminder(profile)
  }, [profile])
  const [sleepDialogOpen, setSleepDialogOpen] = useState(false)
  /** 训练卡上的「记一次」：就地开表单，不跳二级页（训练页仍在「查看记录」里） */
  const [trainingFormOpen, setTrainingFormOpen] = useState(false)
  /** 手机健康应用导入的弹窗；只在安卓原生端有入口 */
  const [importOpen, setImportOpen] = useState(false)
  /** 理想作息的内联编辑：平时收成一行，点「编辑」展开两个时间框 */
  const [idealEditing, setIdealEditing] = useState(false)
  const [idealBed, setIdealBed] = useState('23:00')
  const [idealWake, setIdealWake] = useState('07:00')

  function startIdealEdit() {
    setIdealBed(profile?.idealBedtime ?? '23:00')
    setIdealWake(profile?.idealWakeTime ?? '07:00')
    setIdealEditing(true)
  }

  /** 理想作息不依赖身体档案：没建过档案就建一份只含作息的最简档案，其余字段留空 */
  async function saveIdeal() {
    const base: HealthProfile = profile ?? emptyProfile()
    await saveHealthProfile({
      ...base,
      idealBedtime: idealBed || '23:00',
      idealWakeTime: idealWake || '07:00',
      updatedAt: Date.now(),
    })
    setIdealEditing(false)
  }
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
  const intakeReview = intakeReviewKey(
    totals.kcal,
    targets.targetKcal,
    totals.protein,
    targets.proteinTarget,
  )
  const dayTrainingSummary = summarizeDay(trainings ?? [])
  const weekTrainingSummary = summarizeWeek(trainingWeek ?? [], trainingWeekStart, dayKey)

  // 训练提醒：计划改动后排安卓本地通知；前台按「今天」检查计划与断档，和训练页同一套规则
  const latestTrainingRow = useLiveQuery(() => latestTraining(), [])
  useEffect(() => {
    void syncTrainingReminder(profile?.trainingPlan)
  }, [profile?.trainingPlan])
  useEffect(() => {
    const check = () => {
      const gap = latestTrainingRow
        ? daysBetween(latestTrainingRow.dateKey, todayKey())
        : -1
      maybeNotifyTraining(profile?.trainingPlan, gap === 0, gap)
    }
    check()
    const timer = window.setInterval(check, 60_000)
    return () => window.clearInterval(timer)
  }, [profile?.trainingPlan, latestTrainingRow])
  const sleepWakeSummary = sleep ? sleepWakeStats(sleep) : null
  const sleepWakeEvents = sleep ? sortWakeEvents(sleep.wakeEvents ?? [], sleep.bedtime) : []
  const sleepReview =
    sleep === null || sleep === undefined
      ? null
      : sleepReviewKey(
          sleepMinutes(sleep.bedtime, sleep.wakeTime),
          sleep.quality,
          sleepWakeSummary?.count ?? null,
          sleepWakeSummary?.minutes ?? null,
        )
  const sleepWake =
    sleepWakeSummary === null
      ? null
      : sleepWakeMessage(sleepWakeSummary.count, sleepWakeSummary.minutes)
  const fieldNames = missing
    .map((key) => t(FIELD_LABELS[key as keyof typeof FIELD_LABELS]))
    .join(' / ')

  return (
    <div
      className={'w-full p-4 ' + swipe.animationClass}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      {/* 日期与页面级入口（食物库 / 档案）吸顶常驻，跟日记同一条口径 */}
      <DayNav
        dayKey={dayKey}
        onChange={setDayKey}
        onPick={() => void openPicker()}
        labels={{
          prev: t('health.prevDay'),
          next: t('health.nextDay'),
          pick: t('health.pickDate'),
          today: t('health.backToToday'),
        }}
        trailing={
          <>
            <Link
              to="/health/foods"
              className="inline-flex h-8 items-center rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg"
            >
              {t('health.foods')}
            </Link>
            <Link
              to="/health/profile"
              aria-label={t('health.profile')}
              title={t('health.profile')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-fg"
            >
              <Icon name="settings" className="h-4 w-4" />
              <span className="sr-only">{t('health.profile')}</span>
            </Link>
          </>
        }
      />

      {!ready && (
        <section className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="m-0 text-sm text-fg">{t('health.setupNeeded')}</p>
          <p className="m-0 mt-1 text-xs text-muted">
            {t('health.setupMissing', { fields: fieldNames })}
          </p>
          <Link to="/health/profile" className={`${OUTLINE_BUTTON} mt-3`}>
            <Icon name="settings" />
            {t('health.setupAction')}
          </Link>
        </section>
      )}

      {ready && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          {/* 指标卡式头部：小标题 + 右上角记录入口，不再用大标题和分隔线 */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-medium text-fg">{t('records.kindIntake')}</h2>
            <Link
              to={`/health/intakes?date=${dayKey}`}
              className="shrink-0 text-xs tabular-nums text-muted transition-colors hover:text-brand"
            >
              {t('health.viewRecords')}
              {intakes !== undefined && intakes.length > 0
                ? ` · ${t('health.itemCount', { n: intakes.length })}`
                : ''}{' '}
              ›
            </Link>
          </div>
          {intakeReview && (
            <p className="m-0 mt-2 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
              {t(intakeReview)}
            </p>
          )}
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="m-0 text-3xl font-medium tabular-nums leading-none text-fg">
              {formatNum(totals.kcal)}
              <span className="ml-1 text-xs font-normal text-muted">{t('health.kcalUnit')}</span>
            </p>
            {remaining !== null && (
              <p className={`m-0 text-xs ${remaining >= 0 ? 'text-muted' : 'text-danger'}`}>
                {remaining >= 0
                  ? t('health.remaining', { value: formatNum(remaining) })
                  : t('health.over', { value: formatNum(Math.abs(remaining)) })}
              </p>
            )}
          </div>

          <IntakeBar
            totals={totals}
            tdee={targets.tdee}
            target={targets.targetKcal}
            derived={derivedTdee ?? null}
          />
          <ProteinBar value={totals.protein} target={targets.proteinTarget} />
          <HealthEstimateNote interactive className="mt-2" />

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={`${SOLID_BUTTON} mt-3 w-full`}
          >
            <Icon name="utensils" />
            {t('health.addIntake')}
          </button>
        </section>
      )}

      {/* 每周空腹称重：设称重日、记体重、看推算 TDEE */}
      <div className="mt-4">
        <WeighInCard profile={profile} derived={derivedTdee} />
      </div>

      {/* 睡眠：一夜一行，dateKey = 起床那天；跟摄入互不相干，档案没填也能记 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-sm font-medium text-fg">{t('health.sleepTitle')}</h2>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {sleep && (
              <button
                type="button"
                onClick={() => setSleepDialogOpen(true)}
                className="text-muted transition-colors hover:text-brand"
              >
                {t('health.sleepEdit')}
              </button>
            )}
            {/* 删除、回收站、批量都在「睡眠记录」页 */}
            <Link
              to={`/health/sleeps?date=${dayKey}`}
              className="text-muted transition-colors hover:text-brand"
            >
              {t('health.viewRecords')} ›
            </Link>
          </div>
        </div>
        {sleep === undefined ? null : sleep === null ? (
          <>
            <p className="m-0 mt-2 text-xs text-muted">
              {isToday
                ? t('health.sleepEmpty')
                : t('health.sleepEmptyDay', { date: formatDate(dayKey, t) })}
            </p>
            <button
              type="button"
              onClick={() => setSleepDialogOpen(true)}
              className={SOLID_BUTTON + ' mt-3 w-full'}
            >
              <Icon name="bed" />
              {t('health.sleepAdd')}
            </button>
          </>
        ) : (
          <div className="mt-2">
            {sleepReview && (
              <p className="m-0 mb-2 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
                {t(sleepReview)}
              </p>
            )}
            <p className="m-0 text-3xl font-medium tabular-nums leading-none text-fg">
              {t('health.sleepDuration', sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime)))}
            </p>
            <p className="m-0 mt-1 text-xs tabular-nums text-muted">
              {sleep.bedtime} → {sleep.wakeTime}
              {sleep.quality !== null && (
                <span className="ml-2 text-warning">{'★'.repeat(sleep.quality)}</span>
              )}
              {sleepWake && <span className="ml-2">{t(sleepWake.key, sleepWake.params)}</span>}
            </p>
            {sleepWakeEvents.length > 0 && (
              <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted">
                {sleepWakeEvents.map((event, index) => (
                  <span key={`${event.time}-${index}`}>
                    {t('health.sleepWakeRow', { time: event.time, m: event.minutes })}
                  </span>
                ))}
              </p>
            )}
            <SleepBar
              sleep={sleep}
              idealBedtime={profile?.idealBedtime ?? '23:00'}
              idealWakeTime={profile?.idealWakeTime ?? '07:00'}
            />
            {sleep.note !== '' && <p className="m-0 mt-2 text-xs text-fg">{sleep.note}</p>}
          </div>
        )}

        {/* 理想作息：不依赖身体档案，谁都设得了；平时收成一行，点编辑展开 */}
        <div className="mt-3 border-t border-line pt-2.5">
          {idealEditing ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{t('health.idealBedtime')}</span>
              <input
                type="time"
                value={idealBed}
                aria-label={t('health.idealBedtime')}
                onChange={(event) => setIdealBed(event.target.value)}
                className={INPUT + ' w-28'}
              />
              <span aria-hidden="true">→</span>
              <span>{t('health.idealWake')}</span>
              <input
                type="time"
                value={idealWake}
                aria-label={t('health.idealWake')}
                onChange={(event) => setIdealWake(event.target.value)}
                className={INPUT + ' w-28'}
              />
              <button type="button" onClick={() => void saveIdeal()} className={SOLID_SMALL_BUTTON}>
                <Icon name="check" className="mr-1 h-3.5 w-3.5 shrink-0" />
                {t('health.weightSave')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startIdealEdit}
              className="flex w-full items-center justify-between gap-2 rounded text-xs text-muted transition-colors hover:text-fg"
            >
              <span>{t('health.idealTitle')}</span>
              <span className="tabular-nums">
                {profile?.idealBedtime ?? '23:00'} → {profile?.idealWakeTime ?? '07:00'} ·{' '}
                {t('health.sleepEdit')}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* 训练卡：今天练了没有 + 本周次数。
          两个入口分工写清楚（2026-11-02 修）：右上角「查看记录」进训练页（列表、计划、导出都在那儿），
          底下「记一次」就地开表单——原先两个按钮都跳同一个二级页，点哪个都像点错了 */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-sm font-medium text-fg">{t('training.title')}</h2>
          <Link
            to={`/health/training?date=${dayKey}`}
            className="shrink-0 text-xs tabular-nums text-muted transition-colors hover:text-brand"
          >
            {t('health.viewRecords')}
            {trainings !== undefined && trainings.length > 0
              ? ` · ${t('health.itemCount', { n: trainings.length })}`
              : ''}{' '}
            ›
          </Link>
        </div>
        {trainings === undefined ? null : trainings.length === 0 ? (
          <p className="m-0 mt-2 text-xs text-muted">{t('training.dayEmpty')}</p>
        ) : (
          <p className="m-0 mt-2 text-2xl font-medium tabular-nums text-fg">
            {dayTrainingSummary.volumeKg > 0
              ? formatVolume(dayTrainingSummary.volumeKg)
              : formatDuration(dayTrainingSummary.totalDurationMin, t)}
          </p>
        )}
        <p className="m-0 mt-1 text-[11px] tabular-nums text-muted">
          {t('training.weekSessions')} {weekTrainingSummary.sessions} ·{' '}
          {t('training.weekDays')} {weekTrainingSummary.days} · {t('training.volume')}{' '}
          {formatVolume(weekTrainingSummary.volumeKg)}
        </p>
        <button
          type="button"
          onClick={() => setTrainingFormOpen(true)}
          className={`${SOLID_BUTTON} mt-3 w-full`}
        >
          <Icon name="dumbbell" />
          {t('training.add')}
        </button>
      </section>

      {/* 手机健康应用的数据只能从安卓端读，桌面和浏览器不显示这块 */}
      {canImportFromHealthApp() && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-medium">{t('health.deviceTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('health.deviceDesc')}</p>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className={OUTLINE_BUTTON + ' mt-3'}
          >
            <Icon name="import" />
            {t('health.deviceAction')}
          </button>
        </section>
      )}

      {importOpen && <HealthDeviceImportDialog onClose={() => setImportOpen(false)} />}

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

      {/* 记完自动收起；列表靠 live query 自己刷新，不用在这里回读 */}
      {trainingFormOpen && (
        <TrainingForm dateKey={dayKey} onClose={() => setTrainingFormOpen(false)} />
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

      {disclaimerOpen && (
        <HealthDisclaimerDialog firstRun onClose={() => setDisclaimerOpen(false)} />
      )}
    </div>
  )
}
