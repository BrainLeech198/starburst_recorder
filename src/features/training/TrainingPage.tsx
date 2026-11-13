/**
 * 训练页：日期栏 + 当天小结 + 记录列表 + 操作条。
 *
 * 入口挂在健康页，所以不从底部导航进；视觉上比健康其它页更有运动感：
 * 顶部是主色进度环（本周次数 / 计划天数）+ 一个大数字（当天容量或时长），
 * 记录行用类型色块徽标区分力量、有氧、拉伸、球类。
 */
import { useState, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { HealthTraining, TrainingKind } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import DayNav from '@/shared/ui/DayNav'
import BackButton from '@/shared/ui/BackButton'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import EmptyState from '@/shared/ui/EmptyState'
import { NAV_BACK_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import {
  formatDuration,
  formatVolume,
  summarizeDay,
  summarizeWeek,
  trainingLabel,
  weekRange,
} from './trainingMath'
import { planOfProfile } from './trainingPlan'
import {
  removeHealthTraining,
  restoreHealthTraining,
  trainingDays,
  trainingOfDay,
  trainingsBetween,
} from './trainingRepo'
import { healthProfile } from '@/features/health/healthRepo'
import { buildSingleRecordExport } from '@/features/records/recordExport'
import {
  importRecords,
  isRecordsFile,
  readRecordsFile,
  recordsCount,
} from '@/features/records/recordImport'
import { describeSave, saveTextFile } from '@/platform/saveFile'
import TrainingForm from './TrainingForm'
import TrainingDetailDialog from './TrainingDetailDialog'
import TrainingPlanPanel from './TrainingPlanPanel'

/** 类型徽标的配色：力量用主色，有氧用绿色，拉伸用黄色，球类用危险色，其它走中性 */
function kindBadge(kind: TrainingKind) {
  const map: Record<TrainingKind, string> = {
    strength: 'bg-brand/15 text-brand',
    cardio: 'bg-success/15 text-success',
    mobility: 'bg-warning/15 text-warning',
    sport: 'bg-danger/15 text-danger',
    other: 'bg-surface-2 text-muted',
  }
  return map[kind]
}

function Ring({ ratio }: { ratio: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  return (
    <svg viewBox="0 0 72 72" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="6" className="stroke-line" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${circumference * Math.min(1, Math.max(0, ratio))} ${circumference}`}
        className="stroke-brand"
      />
    </svg>
  )
}

export default function TrainingPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()

  const profile = useLiveQuery(() => healthProfile(), [])
  const dayTrainings = useLiveQuery(() => trainingOfDay(dayKey), [dayKey])
  const range = weekRange(dayKey)
  const fortnight = useLiveQuery(
    () => trainingsBetween(shiftDay(range.from, -7), range.to),
    [range.from, range.to],
  )

  const [form, setForm] = useState<{ training: HealthTraining | null } | null>(null)
  const [detail, setDetail] = useState<HealthTraining | null>(null)
  const [pendingDelete, setPendingDelete] = useState<HealthTraining | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())
  const batch = useBatchSelect()
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const rows = dayTrainings ?? []
  const daySummary = summarizeDay(rows)
  const weekSummary = summarizeWeek(fortnight ?? [], range.from, dayKey)
  const plan = planOfProfile(profile)
  const hasWeeklyGoal = plan.enabled && plan.weeklyDays.length > 0
  const planDays = plan.weeklyDays.length
  const ratio = hasWeeklyGoal ? weekSummary.sessions / planDays : 0
  function setDay(next: string) {
    if (batch.active) batch.exit()
    setSearchParams({ date: next }, { replace: true })
  }

  const swipe = useDaySwipe(
    () => setDay(shiftDay(dayKey, -1)),
    () => setDay(shiftDay(dayKey, 1)),
  )

  async function openPicker() {
    setWrittenDays(new Set(await trainingDays()))
    setPickerOpen(true)
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    setDetail(null)
    await removeHealthTraining(target.id)
    showToast({
      message: t('training.deletedUndo'),
      actionLabel: t('training.undo'),
      onAction: () => {
        void restoreHealthTraining(target.id)
      },
    })
  }

  /** 单条训练导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportTraining(training: HealthTraining) {
    const file = buildSingleRecordExport('training', training)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  /** 记录级 JSON 导入：只认训练，同 id 覆盖、其余追加 */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    const text = await picked.text()
    if (!isRecordsFile(text)) {
      showToast({ message: t('records.importBadFile') })
      return
    }
    const result = readRecordsFile(text)
    if (!result.ok || recordsCount(result.file, ['training']) === 0) {
      showToast({ message: t(result.ok ? 'records.importNone' : 'records.importBadFile') })
      return
    }
    const done = await importRecords(result.file, ['training'])
    showToast({
      message: t('records.importDone', {
        total: done.stats.trainings.total,
        overwritten: done.stats.trainings.overwritten,
      }),
    })
  }

  async function handleBatchDelete() {
    const ids = batch.selected
    if (ids.length === 0) return
    setBatchDeleting(false)
    for (const id of ids) await removeHealthTraining(id)
    batch.exit()
    showToast({
      message: t('training.deleted'),
      actionLabel: t('training.undo'),
      onAction: () => {
        for (const id of ids) void restoreHealthTraining(id)
      },
    })
  }

  function openBatch() {
    // 批量只在本日记录里选；换天会自动退出，不会删到看不见的记录
    batch.enter()
  }

  const bigValue =
    daySummary.volumeSets > 0
      ? formatVolume(daySummary.volumeKg)
      : daySummary.totalDurationMin > 0
        ? formatDuration(daySummary.totalDurationMin, t)
        : t('training.volumeUnavailable')

  return (
    <div
      className={'w-full p-4 ' + swipe.animationClass}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      {!batch.active && (
        <DayNav
          dayKey={dayKey}
          onChange={setDay}
          onPick={() => void openPicker()}
          labels={{
            prev: t('health.prevDay'),
            next: t('health.nextDay'),
            pick: t('health.pickDate'),
            today: t('health.backToToday'),
          }}
          leading={
            <BackButton
              to="/"
              label={t('nav.home')}
              icon
              className={`${NAV_BACK_BUTTON} gap-1`}
            />
          }
        />
      )}

      {/* 当天小结 + 本周进度环 */}
      {!batch.active && (
        <section className="mt-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-4">
            <div className="relative grid h-20 w-20 shrink-0 place-items-center">
              {hasWeeklyGoal ? (
                <>
                  <Ring ratio={ratio} />
                  <span className="absolute inset-0 flex flex-col items-center justify-center text-xs tabular-nums text-fg">
                    <span className="text-lg font-medium">{weekSummary.sessions}</span>
                    <span className="text-[10px] text-muted">/ {planDays}</span>
                  </span>
                </>
              ) : (
                <span className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-surface-2 text-fg">
                  <span className="text-lg font-medium tabular-nums">{weekSummary.sessions}</span>
                  <span className="text-[9px] text-muted">{t('training.weekSessions')}</span>
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[11px] text-muted">
                {rows.length > 0 ? t('training.dayTitle') : t('training.dayEmpty')}
              </p>
              <p className="m-0 mt-1 truncate text-3xl font-medium tabular-nums text-fg">
                {bigValue}
              </p>
              <p className="m-0 mt-1 text-[11px] tabular-nums text-muted">
                {t('training.totalSets')} {daySummary.totalSets} · {t('training.totalReps')}{' '}
                {daySummary.totalReps} · {t('training.totalDuration')}{' '}
                {daySummary.totalDurationMin > 0 ? formatDuration(daySummary.totalDurationMin, t) : '—'}
              </p>
            </div>
          </div>

          {daySummary.muscles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
              {daySummary.muscles.map((muscle) => (
                <span
                  key={muscle}
                  className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand"
                >
                  {t(`training.muscle.${muscle}` as MessageKey)}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-3 text-[11px]">
            <div>
              <span className="text-muted">{t('training.weekSessions')}</span>
              <span className="ml-2 tabular-nums text-fg">{weekSummary.sessions}</span>
            </div>
            <div>
              <span className="text-muted">{t('training.weekDays')}</span>
              <span className="ml-2 tabular-nums text-fg">{weekSummary.days}</span>
            </div>
            <div>
              <span className="text-muted">{t('training.volume')}</span>
              <span className="ml-2 tabular-nums text-fg">
                {weekSummary.volumeSets > 0
                  ? formatVolume(weekSummary.volumeKg)
                  : t('training.volumeUnavailable')}
              </span>
            </div>
            <div>
              <span className="text-muted">{t('training.weekVsLast')}</span>
              <span className="ml-2 tabular-nums text-fg">
                {weekSummary.previousVolumeSets === 0 || weekSummary.volumeSets === 0
                  ? t('training.volumeUnavailable')
                  : `${Math.round(
                      ((weekSummary.volumeKg - weekSummary.previousVolumeKg) /
                        weekSummary.previousVolumeKg) *
                        100,
                    )}%`}
              </span>
            </div>
          </div>
          {weekSummary.gapDays > 0 && (
            <p className="m-0 mt-2 text-[11px] text-warning">
              {t('training.gapDays', { n: weekSummary.gapDays })}
            </p>
          )}
        </section>
      )}

      {/* 操作条：记一次是主操作，批量与回收站并列 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!batch.active && (
          <>
            <button
              type="button"
              onClick={() => setForm({ training: null })}
              className={SOLID_BUTTON}
            >
              <Icon name="plus" />
              {t('training.add')}
            </button>
            <button type="button" onClick={openBatch} className={SOLID_BUTTON}>
              <Icon name="list" />
              {t('training.batch')}
            </button>
            <Link to="/training/trash" className={SOLID_BUTTON}>
              <Icon name="trash" />
              {t('training.trash')}
            </Link>
            <button type="button" onClick={() => setPlanOpen(true)} className={OUTLINE_BUTTON}>
              <Icon name="calendar" />
              {t('training.plan.title')}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={OUTLINE_BUTTON}
            >
              <Icon name="import" />
              {t('records.import')}
            </button>
            {/* 记录级 JSON 导入的隐藏文件框 */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void handleImportFile(event)}
            />
          </>
        )}
      </div>

      {batch.active ? (
        <>
          <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.length === 0 ? (
              <p className="m-0 p-4 text-xs text-muted">{t('training.empty')}</p>
            ) : (
              rows.map((training, index) => (
                <button
                  key={training.id}
                  type="button"
                  onClick={() => batch.toggle(training.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-2 ${
                    index > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <RowCheckbox
                    checked={batch.isSelected(training.id)}
                    label={trainingLabel(training) || t(`training.kind.${training.kind}` as MessageKey)}
                    onToggle={() => batch.toggle(training.id)}
                  />
                  <span className="shrink-0 tabular-nums text-muted">{training.time}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {trainingLabel(training) || t(`training.kind.${training.kind}` as MessageKey)}
                  </span>
                </button>
              ))
            )}
          </section>
          <BatchActions select={batch} ids={rows.map((item) => item.id)} unit={t('training.sets')}>
            <button
              type="button"
              onClick={() => setBatchDeleting(true)}
              disabled={batch.count === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-xs text-danger transition-colors hover:opacity-80 disabled:opacity-40 md:min-h-0"
            >
              <Icon name="trash" />
              {t('common.delete')}
            </button>
          </BatchActions>
        </>
      ) : dayTrainings === undefined ? null : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="🏋️" text={t('training.empty')} />
          <button
            type="button"
            onClick={() => setForm({ training: null })}
            className={`${SOLID_BUTTON} mt-3 w-full`}
          >
            <Icon name="plus" />
            {t('training.first')}
          </button>
        </div>
      ) : (
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {[...rows].reverse().map((training) => {
            const summary = summarizeDay([training])
            const label =
              trainingLabel(training) || t(`training.kind.${training.kind}` as MessageKey)
            const exerciseCount = training.exercises.length
            return (
              <li key={training.id}>
                <button
                  type="button"
                  onClick={() => setDetail(training)}
                  className="flex w-full items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${kindBadge(
                      training.kind,
                    )}`}
                  >
                    {t(`training.kind.${training.kind}` as MessageKey)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm text-fg">{label}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">
                        {training.time}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted">
                      {t('training.exerciseCount', { n: exerciseCount })}
                      {summary.totalSets > 0 && ` · ${t('training.setCount', { n: summary.totalSets })}`}
                      {summary.volumeKg > 0 && ` · ${formatVolume(summary.volumeKg)}`}
                      {summary.totalDurationMin > 0 &&
                        ` · ${formatDuration(summary.totalDurationMin, t)}`}
                    </span>
                    {training.note !== '' && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        {training.note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {form && (
        <TrainingForm
          dateKey={dayKey}
          training={form.training}
          onClose={() => {
            setForm(null)
            setDetail(null)
          }}
        />
      )}

      {detail && (
        <TrainingDetailDialog
          training={detail}
          onClose={() => setDetail(null)}
          onEdit={() => setForm({ training: detail })}
          onDelete={() => setPendingDelete(detail)}
          onExport={() => void handleExportTraining(detail)}
        />
      )}

      {planOpen && (
        <TrainingPlanPanel profile={profile} onClose={() => setPlanOpen(false)} />
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dayKey}
          highlightDays={writtenDays}
          onConfirm={(next) => {
            setPickerOpen(false)
            setDay(next)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('training.purgeTitle')}
          description={t('training.purgeDesc')}
          confirmLabel={t('common.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {batchDeleting && (
        <ConfirmDialog
          title={t('training.purgeTitle')}
          description={t('training.purgeDesc')}
          confirmLabel={t('common.delete')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleting(false)}
        />
      )}
    </div>
  )
}
