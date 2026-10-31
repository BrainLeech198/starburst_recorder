import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import DayNav from '@/shared/ui/DayNav'
import { useI18n } from '@/shared/i18n/context'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON, SOLID_SMALL_BUTTON } from '@/shared/ui/buttonStyles'
import type { HealthProfile } from '@/core/db/schema'
import IntakeBar, { ProteinBar } from './IntakeBar'
import WeighInCard from './WeighInCard'
import SleepBar from './SleepBar'
import { intakeReviewKey, sleepReviewKey, sleepWakeMessage } from './healthViz'
import { useDerivedTdee } from './useDerivedTdee'
import { maybeNotifyWeighDay, syncWeighReminder } from './weighNotify'
import SleepDialog from './SleepDialog'
import { sleepMinutes, sleepParts } from './sleepMath'
import IntakeDialog from './IntakeDialog'
import HealthEstimateNote, { HealthDisclaimerDialog } from './HealthDisclaimer'
import { hasAcknowledgedDisclaimer } from './disclaimerAck'
import { dayTargets, emptyProfile, formatNum, missingProfileFields, remainingKcal, sumMacros } from './healthMath'
import { healthProfile, intakeDays, intakesOfDay, saveHealthProfile, sleepDays, sleepOfDay } from './healthRepo'
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
  // 第一次进健康页先说明「这些数字都是估算」，确认过就不再弹
  const [disclaimerOpen, setDisclaimerOpen] = useState(() => !hasAcknowledgedDisclaimer())
  /** 这一夜的睡眠；null = 没记，undefined = 还在查 */
  const sleep = useLiveQuery(async () => (await sleepOfDay(dayKey)) ?? null, [dayKey])
  const derivedTdee = useDerivedTdee(profile)
  // 称重日提醒：应用内横幅由 WeighInCard 负责，这里补系统通知（桌面到点弹、安卓排本地通知）
  useEffect(() => {
    maybeNotifyWeighDay(profile)
    void syncWeighReminder(profile)
  }, [profile])
  const [sleepDialogOpen, setSleepDialogOpen] = useState(false)
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
  const sleepReview =
    sleep === null || sleep === undefined
      ? null
      : sleepReviewKey(
          sleepMinutes(sleep.bedtime, sleep.wakeTime),
          sleep.quality,
          sleep.wakeCount,
          sleep.wakeMinutes,
        )
  const sleepWake =
    sleep === null || sleep === undefined
      ? null
      : sleepWakeMessage(sleep.wakeCount, sleep.wakeMinutes)
  const fieldNames = missing
    .map((key) => t(FIELD_LABELS[key as keyof typeof FIELD_LABELS]))
    .join(' / ')

  return (
    <div className="w-full p-4">
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:text-fg"
            >
              <span aria-hidden="true">⚙</span>
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

      {disclaimerOpen && (
        <HealthDisclaimerDialog firstRun onClose={() => setDisclaimerOpen(false)} />
      )}
    </div>
  )
}
