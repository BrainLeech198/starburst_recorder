/**
 * 摄入记录页：跟日记 / 随记同一套骨架——日期导航、按钮行、当天列表。
 *
 * 健康首页的卡片只留概览和「记一笔」，明细、批量、导出、回收站入口都放到这里，
 * 一屏不再被记录列表占掉，翻旧日子也不用先展开。
 */
import EmptyState from '@/shared/ui/EmptyState'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import PhotoPreview from '@/shared/ui/PhotoPreview'
import RowMenu from '@/shared/ui/RowMenu'
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
import { Icon } from '@/shared/ui/icons'
import MealParts from './MealParts'
import IntakeDialog from './IntakeDialog'
import IntakeDetailDialog from './IntakeDetailDialog'
import IntakeEditDialog from './IntakeEditDialog'
import IntakeEditChoiceDialog from './IntakeEditChoiceDialog'
import DayNav from '@/shared/ui/DayNav'
import BackButton from '@/shared/ui/BackButton'
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
import ShareDialog from '@/features/share/ShareDialog'
import type { ShareIntakeDoc } from '@/features/share/shareCode'
import { buildIntakeShare } from '@/features/share/recordShare'

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
  const [sharing, setSharing] = useState<ShareIntakeDoc | null>(null)
  /** 编辑前先问：只改这条记录，还是连食物库一起改 */
  const [editChoice, setEditChoice] = useState<HealthIntake | null>(null)
  /** 正在编辑的那一笔；syncLibrary 表示保存时同时写回食物库 */
  const [editing, setEditing] = useState<{ intake: HealthIntake; syncLibrary: boolean } | null>(null)
  /** 同步编辑要写回的那条食物；找不到（已删）就退回单独编辑 */
  const linkedFood =
    editing?.intake.foodId ? ((foods ?? []).find((food) => food.id === editing.intake.foodId) ?? null) : null
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

  /**
   * 编辑入口：这一笔来自食物库时先问「只改记录」还是「连食物库一起改」；
   * 手动记录、套餐快照没有对应食物，直接进编辑。
   */
  function requestEdit(intake: HealthIntake) {
    const hasLinkedFood =
      !!intake.foodId && (foods ?? []).some((food) => food.id === intake.foodId)
    if (hasLinkedFood) {
      setEditChoice(intake)
      return
    }
    setEditing({ intake, syncLibrary: false })
  }

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
          <BackButton
            to="/health"
            label={t('nav.health')}
            icon
            className={`${NAV_BACK_BUTTON} gap-1`}
          />
        }
        trailing={
          <Link
            to="/health/foods"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted transition-colors hover:text-fg"
          >
            <Icon name="folder" className="h-3.5 w-3.5 shrink-0" />
            {t('health.foods')}
          </Link>
        }
      />

      {/* 整行都是按钮，套一层底色跟下面的列表分开；窄屏排 2×2，宽屏一行 */}
      <ToolbarRow className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        {!batch.active && (
          <>
            <button type="button" onClick={() => setDialogOpen(true)} className={SOLID_BUTTON}>
              <Icon name="utensils" />
              {t('health.addIntake')}
            </button>
            <button
              type="button"
              onClick={() => batch.enter()}
              disabled={rows.length === 0}
              className={`${SOLID_BUTTON} disabled:opacity-40`}
            >
              <Icon name="list" />
              {t('health.batch')}
            </button>
          </>
        )}
        <Link to="/health/intakes/trash" className={`${SOLID_BUTTON} col-span-2 sm:col-span-1`}>
          <Icon name="trash" />
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
                  <PhotoPreview
                    src={photo}
                    alt=""
                    className="h-11 w-11 rounded-lg border border-line/60"
                    wrapperClassName="shrink-0"
                  />
                )}
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
                    <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs tabular-nums text-muted">
                      <span>{intake.time}</span>
                      <span>
                        {formatNum(intake.kcal)} {t('health.kcalUnit')}
                      </span>
                      <span>
                        {t('health.legendProtein')} {formatNum(intake.protein)} g
                      </span>
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
                  <RowMenu
                    label={t('common.more')}
                    items={[
                      {
                        label: t('health.editIntake'),
                        icon: 'edit',
                        onSelect: () => requestEdit(intake),
                      },
                      {
                        label: t('share.action'),
                        icon: 'share',
                        onSelect: () => setSharing(buildIntakeShare(intake)),
                      },
                      {
                        label: t('records.export'),
                        icon: 'export',
                        onSelect: () => void handleExportIntake(intake),
                      },
                      {
                        label: t('health.deleteIntake'),
                        icon: 'trash',
                        danger: true,
                        onSelect: () => setPendingDelete(intake),
                      },
                    ]}
                  />
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

      {sharing && <ShareDialog doc={sharing} onClose={() => setSharing(null)} />}

      {detailIntake && (
        <IntakeDetailDialog
          intake={detailIntake}
          onClose={() => setDetailIntake(null)}
          onEdit={() => {
            requestEdit(detailIntake)
            setDetailIntake(null)
          }}
        />
      )}

      {editChoice && (
        <IntakeEditChoiceDialog
          name={editChoice.name}
          onCancel={() => setEditChoice(null)}
          onSingle={() => {
            setEditing({ intake: editChoice, syncLibrary: false })
            setEditChoice(null)
          }}
          onSync={() => {
            setEditing({ intake: editChoice, syncLibrary: true })
            setEditChoice(null)
          }}
        />
      )}

      {editing && (
        <IntakeEditDialog
          key={editing.intake.id}
          intake={editing.intake}
          linkedFood={linkedFood}
          syncLibrary={editing.syncLibrary}
          onClose={() => setEditing(null)}
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
