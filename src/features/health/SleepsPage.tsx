/**
 * 睡眠记录页：日期导航、按钮行、这一夜的详情。
 *
 * 睡眠一天只有一条（dateKey = 起床那天），所以这里不是列表而是一张详情卡；
 * 理想作息这类「管理」也搬到这里，首页卡片只留时长和睡眠条。
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { INPUT } from '@/shared/ui/inputStyles'
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
  saveHealthProfile,
  sleepDays,
  sleepOfDay,
} from './healthRepo'
import type { BackupData } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import RecordExportDialog from '@/features/records/RecordExportDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
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
  /** 日历打开时标亮记过睡眠的那些天 */
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())

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
    setExportData(await exportAllData())
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
        <HealthDayNav dayKey={dayKey} onChange={setDayKey} onPick={() => void openPicker()} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            to="/health"
            className="inline-flex h-8 items-center rounded-lg border border-line px-2 text-xs text-muted transition-colors hover:text-fg"
          >
            {t('nav.health')}
          </Link>
        </div>
      </div>

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
        <Link
          to="/health/sleeps/trash"
          className={`${SOLID_BUTTON} justify-self-start sm:ml-auto`}
        >
          {t('health.sleepTrash')}
        </Link>
      </ToolbarRow>

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

      {profile && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="m-0 text-xs text-muted">{t('health.idealTitle')}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>{t('health.idealBedtime')}</span>
            <input
              type="time"
              value={profile.idealBedtime}
              aria-label={t('health.idealBedtime')}
              onChange={(event) =>
                void saveHealthProfile({
                  ...profile,
                  idealBedtime: event.target.value || '23:00',
                })
              }
              className={INPUT + ' w-28'}
            />
            <span aria-hidden="true">→</span>
            <span>{t('health.idealWake')}</span>
            <input
              type="time"
              value={profile.idealWakeTime}
              aria-label={t('health.idealWake')}
              onChange={(event) =>
                void saveHealthProfile({
                  ...profile,
                  idealWakeTime: event.target.value || '07:00',
                })
              }
              className={INPUT + ' w-28'}
            />
            <span className="w-full text-muted">{t('health.idealHint')}</span>
          </div>
        </section>
      )}

      {!profile && (
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
          initial={{ sleep: sleep ? [sleep.id] : [] }}
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
    </div>
  )
}
