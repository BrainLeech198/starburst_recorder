/**
 * 摄入记录页：跟日记 / 随记同一套骨架——日期导航、按钮行、当天列表。
 *
 * 健康首页的卡片只留概览和「记一笔」，明细、批量、导出、回收站入口都放到这里，
 * 一屏不再被记录列表占掉，翻旧日子也不用先展开。
 */
import EmptyState from '@/shared/ui/EmptyState'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { HealthIntake } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import TimeMeta from '@/shared/ui/TimeMeta'
import { BAR_BUTTON, BAR_DANGER, NAV_BACK_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import MealParts from './MealParts'
import IntakeDialog from './IntakeDialog'
import IntakeDetailDialog from './IntakeDetailDialog'
import IntakeEditDialog from './IntakeEditDialog'
import DayNav from '@/shared/ui/DayNav'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { formatNum } from './healthMath'
import {
  exportAllData,
  healthFoods,
  intakeDays,
  intakesOfDay,
  removeIntake,
  removeIntakes,
  restoreIntake,
  restoreIntakes,
} from './healthRepo'
import type { BackupData } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import RecordExportDialog from '@/features/records/RecordExportDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
import { describeSave, saveTextFile } from '@/platform/saveFile'

export default function IntakesPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  // 日期进 URL：刷新、返回都还停在这一天
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()
  const isToday = dayKey === todayKey()

  const batch = useBatchSelect()
  const intakes = useLiveQuery(() => intakesOfDay(dayKey), [dayKey])
  // 食物库用来给列表行找缩略图：摄入只存 foodId，照片始终取库里当前那张
  const foods = useLiveQuery(() => healthFoods(), [])
  const photoById = new Map((foods ?? []).map((food) => [food.id, food.photo] as const))
  /** 套餐取第一个有照片的成分，单条直接用自己的 foodId */
  function photoOf(intake: HealthIntake): string | null {
    if (intake.foodId) {
      const own = photoById.get(intake.foodId)
      if (own) return own
    }
    for (const part of intake.components ?? []) {
      if (!part.foodId) continue
      const photo = photoById.get(part.foodId)
      if (photo) return photo
    }
    return null
  }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HealthIntake | null>(null)
  /** 点开某一笔看完整营养成分 */
  const [detailIntake, setDetailIntake] = useState<HealthIntake | null>(null)
  /** 正在编辑的那一笔 */
  const [editingIntake, setEditingIntake] = useState<HealthIntake | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  /** 批量导出时取来的整库数据；非 null 就打开挑选弹窗 */
  const [exportData, setExportData] = useState<BackupData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 日历打开时标亮记过摄入的那些天 */
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())

  function setDayKey(next: string) {
    // 换天要退出批量：选中的 id 属于旧的那天，留着会删到看不见的记录
    batch.exit()
    setSearchParams({ date: next }, { replace: true })
  }
  const swipe = useDaySwipe(
    () => setDayKey(shiftDay(dayKey, -1)),
    () => setDayKey(shiftDay(dayKey, 1)),
  )

  async function openPicker() {
    setWrittenDays(new Set(await intakeDays()))
    setPickerOpen(true)
  }

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

  async function handleBatchExport() {
    setExportData(await exportAllData())
  }

  /** 单条摄入导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportIntake(intake: HealthIntake) {
    const file = buildSingleRecordExport('intake', intake)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  const rows = intakes ?? []
  const empty = intakes !== undefined && rows.length === 0

  return (
    <div
      className={'w-full p-4 ' + swipe.animationClass}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      {/* 日期与返回入口吸顶常驻，跟日记 / 健康首页一致 */}
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
        leading={
          <Link to="/health" className={NAV_BACK_BUTTON}>
            <span aria-hidden="true">‹</span>
            {t('nav.health')}
          </Link>
        }
        trailing={
          <Link
            to="/health/foods"
            className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted transition-colors hover:text-fg"
          >
            {t('health.foods')}
          </Link>
        }
      />

      {/* 整行都是按钮，套一层底色跟下面的列表分开；窄屏排 2×2，宽屏一行 */}
      <ToolbarRow className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        {!batch.active && (
          <>
            <button type="button" onClick={() => setDialogOpen(true)} className={SOLID_BUTTON}>
              {t('health.addIntake')}
            </button>
            <button
              type="button"
              onClick={() => batch.enter()}
              disabled={rows.length === 0}
              className={`${SOLID_BUTTON} disabled:opacity-40`}
            >
              {t('health.batch')}
            </button>
          </>
        )}
        <Link to="/health/intakes/trash" className={`${SOLID_BUTTON} col-span-2 sm:col-span-1`}>
          {t('health.intakeTrash')}
        </Link>
      </ToolbarRow>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs text-muted">
          {isToday ? t('health.todayTitle') : t('health.dayTitle', { date: formatDate(dayKey, t) })}
        </h2>
        {rows.length > 0 && (
          <span className="text-xs tabular-nums text-muted">
            {t('health.itemCount', { n: rows.length })}
          </span>
        )}
      </div>

      {intakes === undefined ? null : empty ? (
        <div className="mt-2">
          <EmptyState
            icon="🍽️"
            text={
              isToday
                ? t('health.emptyIntake')
                : t('health.emptyIntakeDay', { date: formatDate(dayKey, t) })
            }
          />
        </div>
      ) : (
        <ul className="m-0 mt-2 list-none space-y-2 p-0">
          {rows.map((intake) => {
            const selected = batch.isSelected(intake.id)
            const photo = photoOf(intake)
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
                {photo && (
                  <img
                    src={photo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-11 w-11 shrink-0 rounded-lg border border-line/60 object-cover"
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
                      {formatNum(intake.kcal)} {t('health.kcalUnit')} · {t('health.legendProtein')}{' '}
                      {formatNum(intake.protein)} g
                    </p>
                  </button>
                  <TimeMeta createdAt={intake.createdAt} updatedAt={intake.updatedAt} />
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
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingIntake(intake)}
                      title={t('health.editIntake')}
                      aria-label={t('health.editIntake')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm text-muted transition-colors hover:text-brand"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportIntake(intake)}
                      title={t('records.export')}
                      className="inline-flex h-8 items-center justify-center rounded-lg px-1.5 font-mono text-[10px] text-muted transition-colors hover:text-brand"
                    >
                      JSON
                      <span className="sr-only">{t('records.export')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(intake)}
                      aria-label={t('health.deleteIntake')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {batch.active && (
        <BatchActions
          select={batch}
          ids={rows.map((intake) => intake.id)}
          unit={t('health.unitIntake')}
        >
          <button
            type="button"
            onClick={() => void handleBatchExport()}
            disabled={batch.count === 0}
            className={BAR_BUTTON}
          >
            {t('health.exportIntakes')}
          </button>
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

      {exportData && (
        <RecordExportDialog
          data={exportData}
          initial={{ intake: batch.selected }}
          onClose={() => setExportData(null)}
        />
      )}

      {detailIntake && (
        <IntakeDetailDialog
          intake={detailIntake}
          onClose={() => setDetailIntake(null)}
          onEdit={() => {
            setEditingIntake(detailIntake)
            setDetailIntake(null)
          }}
        />
      )}

      {editingIntake && (
        <IntakeEditDialog
          intake={editingIntake}
          onClose={() => setEditingIntake(null)}
        />
      )}

      {dialogOpen && (
        <IntakeDialog dateKey={dayKey} intakes={rows} onClose={() => setDialogOpen(false)} />
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
