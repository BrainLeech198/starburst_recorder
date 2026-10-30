/**
 * 睡眠记录页：日期导航、按钮行、这一夜的详情。
 *
 * 睡眠一天只有一条（dateKey = 起床那天），所以这里不是列表而是一张详情卡；
 * 理想作息在健康首页的睡眠卡里直接改，删除、回收站、批量、导入都归这里。
 */
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { BAR_BUTTON, BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import HealthDayNav from './HealthDayNav'
import SleepDialog from './SleepDialog'
import SleepBar from './SleepBar'
import { sleepReviewKey } from './healthViz'
import { sleepMinutes, sleepParts } from './sleepMath'
import {
  exportAllData,
  healthProfile,
  removeHealthSleep,
  restoreHealthSleep,
  sleepDays,
  sleepOfDay,
} from './healthRepo'
import type { BackupData } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import RecordExportDialog from '@/features/records/RecordExportDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
import {
  importRecords,
  isRecordsFile,
  readRecordsFile,
  recordsCount,
} from '@/features/records/recordImport'
import { describeSave, saveTextFile } from '@/platform/saveFile'

export default function SleepsPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()

  const profile = useLiveQuery(() => healthProfile(), [])
  const sleep = useLiveQuery(async () => (await sleepOfDay(dayKey)) ?? null, [dayKey])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 勾选导出时取来的整库数据；非 null 就打开挑选弹窗 */
  const [exportData, setExportData] = useState<BackupData | null>(null)
  /** 批量导出时预选中的那些天 */
  const [exportInitial, setExportInitial] = useState<{ sleep: string[] } | undefined>(undefined)
  /** 日历打开时标亮记过睡眠的那些天 */
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())
  const batch = useBatchSelect()
  const [batchDeleting, setBatchDeleting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  /** 批量模式列出所有记过睡眠的日子；平时不查，省一次整库读取 */
  const allSleeps = useLiveQuery(
    async () =>
      batch.active
        ? (await exportAllData()).sleeps
            .filter((item) => !item.deletedAt)
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        : [],
    [batch.active],
  )

  function setDayKey(next: string) {
    setSearchParams({ date: next }, { replace: true })
  }

  async function openPicker() {
    setWrittenDays(new Set(await sleepDays()))
    setPickerOpen(true)
  }

  async function handleDelete() {
    if (!sleep) return
    const target = sleep
    setPendingDelete(false)
    await removeHealthSleep(target.id)
    showToast({
      message: t('health.sleepDeleted'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreHealthSleep(target.id)
      },
    })
  }

  /** 单条睡眠导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportSleep(item: NonNullable<typeof sleep>) {
    const file = buildSingleRecordExport('sleep', item)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  /** 勾选导出：把这一夜的睡眠带进挑选弹窗 */
  async function handleOpenExport() {
    if (!sleep) return
    setExportInitial({ sleep: [sleep.id] })
    setExportData(await exportAllData())
  }

  /** 记录级 JSON 导入：只认睡眠，同一天已有就覆盖、其余追加 */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    // 清掉 value，同一个文件再选一次也会触发
    event.target.value = ''
    if (!picked) return
    const text = await picked.text()
    if (!isRecordsFile(text)) {
      showToast({ message: t('records.importBadFile') })
      return
    }
    const result = readRecordsFile(text)
    if (!result.ok || recordsCount(result.file, ['sleep']) === 0) {
      showToast({ message: t(result.ok ? 'records.importNone' : 'records.importBadFile') })
      return
    }
    const done = await importRecords(result.file, ['sleep'])
    showToast({
      message: t('health.importSleepsDone', {
        total: done.sleeps.total,
        overwritten: done.sleeps.overwritten,
      }),
    })
  }

  /** 批量删除：逐条进回收站，撤销时逐条恢复 */
  async function handleBatchDelete() {
    const ids = batch.selected
    if (ids.length === 0) return
    setBatchDeleting(false)
    for (const id of ids) await removeHealthSleep(id)
    batch.exit()
    showToast({
      message: t('health.batchSleepsDeleted', { n: ids.length }),
      actionLabel: t('diary.undo'),
      onAction: () => {
        for (const id of ids) void restoreHealthSleep(id)
      },
    })
  }

  /** 批量导出：选中的那些天直接带进挑选弹窗 */
  async function handleBatchExport() {
    setExportInitial({ sleep: batch.selected })
    setExportData(await exportAllData())
    batch.exit()
  }

  const review =
    sleep === null || sleep === undefined
      ? null
      : sleepReviewKey(sleepMinutes(sleep.bedtime, sleep.wakeTime), sleep.quality)
  const duration =
    sleep === null || sleep === undefined
      ? null
      : sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime))

  return (
    <div className="w-full p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!batch.active && (
          <HealthDayNav dayKey={dayKey} onChange={setDayKey} onPick={() => void openPicker()} />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            to="/health"
            className="inline-flex h-8 items-center rounded-lg border border-line px-2 text-xs text-muted transition-colors hover:text-fg"
          >
            {t('nav.health')}
          </Link>
        </div>
      </div>

      {!batch.active && (
      <ToolbarRow className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <button type="button" onClick={() => setDialogOpen(true)} className={SOLID_BUTTON}>
          {sleep ? t('health.sleepEdit') : t('health.sleepAdd')}
        </button>
        <button
          type="button"
          onClick={() => void handleOpenExport()}
          disabled={!sleep}
          className={`${OUTLINE_BUTTON} justify-self-start disabled:opacity-40`}
        >
          {t('records.export')}
        </button>
        <button
          type="button"
          onClick={batch.enter}
          className={`${OUTLINE_BUTTON} justify-self-start`}
        >
          {t('health.batch')}
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className={`${OUTLINE_BUTTON} justify-self-start`}
        >
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
        <Link
          to="/health/sleeps/trash"
          className={`${SOLID_BUTTON} justify-self-start sm:ml-auto`}
        >
          {t('health.sleepTrash')}
        </Link>
      </ToolbarRow>
      )}

      {batch.active ? (
        <>
          {/* 跨天批量：列出所有记过睡眠的日子，勾选后可批量删除 / 导出 */}
          <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
            {(allSleeps ?? []).length === 0 ? (
              <p className="m-0 p-4 text-xs text-muted">{t('health.sleepBatchEmpty')}</p>
            ) : (
              (allSleeps ?? []).map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => batch.toggle(item.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-2 ${
                    index > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <RowCheckbox
                    checked={batch.isSelected(item.id)}
                    label={formatDate(item.dateKey, t)}
                    onToggle={() => batch.toggle(item.id)}
                  />
                  <span className="shrink-0 tabular-nums text-fg">{formatDate(item.dateKey, t)}</span>
                  <span className="tabular-nums text-muted">
                    {t('health.sleepDuration', sleepParts(sleepMinutes(item.bedtime, item.wakeTime)))}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted">
                    {item.bedtime} → {item.wakeTime}
                  </span>
                </button>
              ))
            )}
          </section>
          <BatchActions
            select={batch}
            ids={(allSleeps ?? []).map((item) => item.id)}
            unit={t('health.unitSleep')}
          >
            <button
              type="button"
              onClick={() => setBatchDeleting(true)}
              disabled={batch.count === 0}
              className={BAR_DANGER}
            >
              {t('health.deleteIntake')}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchExport()}
              disabled={batch.count === 0}
              className={BAR_BUTTON}
            >
              {t('health.exportSleeps')}
            </button>
          </BatchActions>
        </>
      ) : (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        {sleep === undefined ? null : sleep === null ? (
          <>
            <p className="m-0 text-sm text-fg">{t('health.sleepTitle')}</p>
            <p className="m-0 mt-2 text-xs text-muted">
              {t('health.sleepEmptyDay', { date: formatDate(dayKey, t) })}
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={SOLID_BUTTON + ' mt-3 w-full'}
            >
              {t('health.sleepAdd')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-sm text-fg">{t('health.sleepTitle')}</p>
                <p className="m-0 mt-0.5 font-mono text-[11px] text-muted">{sleep.code}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleExportSleep(sleep)}
                title={t('records.export')}
                className={BAR_BUTTON}
              >
                JSON
                <span className="sr-only">{t('records.export')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                className={BAR_DANGER}
              >
                {t('health.sleepDelete')}
              </button>
            </div>

            {review && (
              <p className="m-0 mt-3 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
                {t(review)}
              </p>
            )}
            {duration && (
              <p className="m-0 mt-2 text-3xl font-medium tabular-nums text-fg">
                {t('health.sleepDuration', duration)}
              </p>
            )}
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
          </>
        )}
        </section>
      )}

      {!profile && !batch.active && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="m-0 text-xs text-muted">{t('health.setupNeeded')}</p>
          <Link to="/health/profile" className={`${OUTLINE_BUTTON} mt-3`}>
            {t('health.setupAction')}
          </Link>
        </section>
      )}

      {dialogOpen && (
        <SleepDialog dateKey={dayKey} sleep={sleep ?? null} onClose={() => setDialogOpen(false)} />
      )}

      {exportData && (
        <RecordExportDialog
          data={exportData}
          initial={exportInitial}
          onClose={() => setExportData(null)}
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
          title={t('health.sleepDeleteTitle')}
          description={t('health.sleepDeleteDesc')}
          confirmLabel={t('health.sleepDelete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(false)}
        />
      )}

      {batchDeleting && (
        <ConfirmDialog
          title={t('health.batchSleepsDeleteTitle', { n: batch.count })}
          description={t('health.batchSleepsDeleteBody')}
          confirmLabel={t('health.sleepDelete')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleting(false)}
        />
      )}
    </div>
  )
}
