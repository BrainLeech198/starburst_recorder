import RowCheckbox from '@/shared/ui/RowCheckbox'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { HealthIntake } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import {
  formatDate,
  isDateKey,
  relativeDayKey,
  shiftDay,
  todayKey,
  weekdayKey,
} from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { BAR_BUTTON, BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import TimeMeta from '@/shared/ui/TimeMeta'
import IntakeBar, { ProteinBar } from './IntakeBar'
import IntakeDialog from './IntakeDialog'
import IntakeDetailDialog from './IntakeDetailDialog'
import MealParts from './MealParts'
import { dayTargets, missingProfileFields, remainingKcal, sumMacros } from './healthMath'
import {
  healthProfile,
  intakeDays,
  intakesOfDay,
  removeIntake,
  removeIntakes,
  restoreIntake,
  restoreIntakes,
} from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'

/** 收起时露几行：够认出今天记了什么，又不至于把下面的卡片挤出屏幕 */
const INTAKE_COLLAPSED_ROWS = 3

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
  const { showToast } = useToast()
  // 跟日记一样把日期放进 URL：刷新、返回都还停在看的这一天
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()
  const isToday = dayKey === todayKey()

  /** 批量多选：只针对当前这一天的摄入 */
  const batch = useBatchSelect()
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  function setDayKey(next: string) {
    batch.exit()
    setListOpen(false)
    setSearchParams({ date: next }, { replace: true })
  }

  const profile = useLiveQuery(() => healthProfile(), [])
  const intakes = useLiveQuery(() => intakesOfDay(dayKey), [dayKey])
  const [dialogOpen, setDialogOpen] = useState(false)
  /** 摄入列表默认只露几行：下面还要接别的健康卡片，一屏不该全被记录占掉 */
  const [listOpen, setListOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HealthIntake | null>(null)
  /** 点开某一笔看完整营养成分 */
  const [detailIntake, setDetailIntake] = useState<HealthIntake | null>(null)
  /** 日历打开时标亮的日期：只有「记过摄入」的那几天 */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())

  async function openPicker() {
    setWrittenDays(new Set(await intakeDays()))
    setPickerOpen(true)
  }

  const missing = missingProfileFields(profile)
  const ready = missing.length === 0
  const totals = sumMacros(intakes ?? [])
  // 折叠时只露前几条；进批量多选就整段展开，不然勾不到藏起来的行
  const shownIntakes = listOpen || batch.active ? (intakes ?? []) : (intakes ?? []).slice(0, INTAKE_COLLAPSED_ROWS)
  // 每天按第一笔摄入时定下的目标线走；旧记录没快照就用当前档案
  const targets = dayTargets(intakes ?? [], profile)
  const remaining = remainingKcal(targets.targetKcal, totals.kcal)
  const fieldNames = missing
    .map((key) => t(FIELD_LABELS[key as keyof typeof FIELD_LABELS]))
    .join(' / ')

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    await removeIntake(target.id)
    showToast({
      message: t('health.intakeDeleted'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreIntake(target.id)
      },
    })
  }

  async function handleBatchDelete() {
    const ids = batch.selected
    setBatchDeleteOpen(false)
    await removeIntakes(ids)
    batch.clear()
    showToast({
      message: t('health.batchDeleted', { n: ids.length }),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreIntakes(ids)
      },
    })
  }

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
                batch.exit()
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
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="m-0 text-xs text-muted">
                {isToday ? t('health.today') : formatDate(dayKey, t)}
              </p>
              <p className="m-0 mt-0.5 text-3xl font-medium tabular-nums text-fg">
                {Math.round(totals.kcal)}
                <span className="ml-1 text-xs font-normal text-muted">{t('health.kcalUnit')}</span>
              </p>
            </div>
            <div className="text-right text-xs">
              {remaining !== null && (
                <p className={`m-0 ${remaining >= 0 ? 'text-muted' : 'text-danger'}`}>
                  {remaining >= 0
                    ? t('health.remaining', { value: remaining })
                    : t('health.over', { value: Math.abs(remaining) })}
                </p>
              )}
            </div>
          </div>

          <IntakeBar totals={totals} tdee={targets.tdee} target={targets.targetKcal} />
          <ProteinBar value={totals.protein} target={targets.proteinTarget} />

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={`${SOLID_BUTTON} mt-3 w-full`}
          >
            {t('health.addIntake')}
          </button>

          {/* 今日记录内嵌在同一张卡里，逐条用小卡片，和食物库列表保持同一套样式 */}
          <div className="mt-4 border-t border-line pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-xs text-muted">
                {isToday
                  ? t('health.todayTitle')
                  : t('health.dayTitle', { date: formatDate(dayKey, t) })}
              </h2>
              <div className="flex items-center gap-1">
                {intakes !== undefined && intakes.length > 0 && (
                  <span className="mr-1 text-xs tabular-nums text-muted">
                    {t('health.itemCount', { n: intakes.length })}
                  </span>
                )}
                {!batch.active && intakes !== undefined && intakes.length > 0 && (
                  <button type="button" onClick={() => batch.enter()} className={BAR_BUTTON}>
                    {t('health.batch')}
                  </button>
                )}
                <Link to="/health/intakes/trash" className={BAR_BUTTON}>
                  {t('health.intakeTrash')}
                </Link>
              </div>
            </div>

            {intakes === undefined ? null : intakes.length === 0 ? (
              <p className="m-0 mt-2 text-xs text-muted">
                {isToday
                  ? t('health.emptyIntake')
                  : t('health.emptyIntakeDay', { date: formatDate(dayKey, t) })}
              </p>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {shownIntakes.map((intake) => {
                  const selected = batch.isSelected(intake.id)
                  return (
                    <li
                      key={intake.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${
                        selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                      }`}
                    >
                      {batch.active && (
                        <RowCheckbox
                          checked={selected}
                          label={intake.name}
                          onToggle={() => batch.toggle(intake.id)}
                        />
                      )}
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                        {intake.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          disabled={batch.active}
                          onClick={() => setDetailIntake(intake)}
                          className="block w-full rounded text-left transition-colors hover:text-brand disabled:cursor-default"
                        >
                          <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                            <span className="truncate">{intake.name}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted">
                              {intake.code}
                            </span>
                          </p>
                          <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
                            {Math.round(intake.kcal)} {t('health.kcalUnit')} ·{' '}
                            {t('health.legendProtein')} {intake.protein} g
                          </p>
                        </button>
                        <TimeMeta
                          createdAt={intake.createdAt}
                          updatedAt={intake.updatedAt}
                        />
                        {/* 套餐是这一行的一条合计，点开才看成分快照 */}
                        {intake.components && intake.components.length > 0 && (
                          <MealParts
                            label={t('intake.partsLabel', { n: intake.components.length })}
                            parts={intake.components.map((part) => ({
                              name: part.name,
                              grams: part.grams,
                              kcal: part.kcal,
                              protein: part.protein,
                            }))}
                          />
                        )}
                      </div>
                      {!batch.active && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(intake)}
                          aria-label={t('health.deleteIntake')}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {!batch.active && (intakes?.length ?? 0) > INTAKE_COLLAPSED_ROWS && (
              <button
                type="button"
                aria-expanded={listOpen}
                onClick={() => setListOpen((value) => !value)}
                className={BAR_BUTTON + ' mt-2 w-full'}
              >
                {listOpen
                  ? t('health.intakeCollapse')
                  : t('health.intakeExpand', { n: (intakes?.length ?? 0) - INTAKE_COLLAPSED_ROWS })}
              </button>
            )}
          </div>
        </section>
      )}

      {batch.active && (
        <BatchActions
          select={batch}
          ids={(intakes ?? []).map((intake) => intake.id)}
          unit={t('health.unitIntake')}
        >
          <button
            type="button"
            onClick={() => setBatchDeleteOpen(true)}
            disabled={batch.count === 0}
            className={BAR_DANGER}
          >
            {t('health.deleteIntake')}
          </button>
        </BatchActions>
      )}

      {batchDeleteOpen && (
        <ConfirmDialog
          title={t('health.batchDeleteTitle', { n: batch.count })}
          description={t('health.batchDeleteBody')}
          confirmLabel={t('health.deleteIntake')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}

      {detailIntake && (
        <IntakeDetailDialog intake={detailIntake} onClose={() => setDetailIntake(null)} />
      )}

      {dialogOpen && (
        <IntakeDialog
          dateKey={dayKey}
          intakes={intakes ?? []}
          onClose={() => setDialogOpen(false)}
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

      {pendingDelete && (
        <ConfirmDialog
          title={t('health.deleteIntakeTitle', { name: pendingDelete.name })}
          description={t('health.deleteIntakeDesc')}
          confirmLabel={t('health.deleteIntake')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
