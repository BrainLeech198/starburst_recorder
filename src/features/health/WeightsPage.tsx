/**
 * 体重记录页：日期导航、按钮行、这一天的称重。
 *
 * 称重历史存在身体档案的 weighIns 里，一天最多一条；所以这里按天看，
 * 不在首页铺「最近称重」列表。称重日 / 提醒时刻这类「管理」也搬到这里。
 */
import TimeMeta from '@/shared/ui/TimeMeta'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { HealthProfile, WeighIn } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { INPUT } from '@/shared/ui/inputStyles'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import {
  BAR_BUTTON,
  BAR_DANGER,
  NAV_BACK_BUTTON,
  SOLID_BUTTON,
  choiceTile,
} from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import DayNav from '@/shared/ui/DayNav'
import { formatNum, round2 } from './healthMath'
import { exportAllData, healthProfile, saveHealthProfile } from './healthRepo'
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

/** 1=周一 … 7=周日；date.weekdayShortN 的编号是 JS 的 0=周日，取个模对上 */
function weighDayLabelKey(day: number): MessageKey {
  return ('date.weekdayShort' + (day % 7)) as MessageKey
}

/** 追加 / 删除称重后重算档案里的「最新体重」，免得档案和最新一条对不上 */
function withWeighIns(base: HealthProfile, list: WeighIn[]): HealthProfile {
  const newest = list.reduce<WeighIn | null>(
    (acc, item) => (acc === null || item.dateKey > acc.dateKey ? item : acc),
    null,
  )
  return {
    ...base,
    weighIns: list,
    weightKg: newest ? newest.weightKg : base.weightKg,
    weightAt: newest ? newest.createdAt : base.weightAt,
  }
}

export default function WeightsPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()

  const profile = useLiveQuery(() => healthProfile(), [])
  const [formOpen, setFormOpen] = useState(false)
  const [weightText, setWeightText] = useState('')
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 勾选导出时取来的整库数据；非 null 就打开挑选弹窗 */
  const [exportData, setExportData] = useState<BackupData | null>(null)
  /** 批量导出时预选中的那些天 */
  const [exportInitial, setExportInitial] = useState<{ weight: string[] } | undefined>(undefined)
  const batch = useBatchSelect()
  const [batchDeleting, setBatchDeleting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const weighIns = profile?.weighIns ?? []
  const entry = weighIns.find((item) => item.dateKey === dayKey) ?? null
  /** 日历里标亮称过重的那些天 */
  const writtenDays = new Set(weighIns.map((item) => item.dateKey))

  function setDayKey(next: string) {
    setFormOpen(false)
    setSearchParams({ date: next }, { replace: true })
  }

  async function handleSave() {
    if (!profile) return
    const kg = Number(weightText)
    if (!Number.isFinite(kg) || kg <= 0) return
    const rounded = round2(kg)
    const list = [
      { dateKey: dayKey, weightKg: rounded, createdAt: Date.now() },
      ...weighIns.filter((item) => item.dateKey !== dayKey),
    ].slice(0, 120)
    await saveHealthProfile(withWeighIns(profile, list))
    setWeightText('')
    setFormOpen(false)
    showToast({ message: t('health.weighSaved', { value: formatNum(rounded) }) })
  }

  async function handleDelete() {
    if (!profile || !entry) return
    const target = entry
    setPendingDelete(false)
    const list = weighIns.filter((item) => item.dateKey !== target.dateKey)
    await saveHealthProfile(withWeighIns(profile, list))
    showToast({
      message: t('health.weightDeleted'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void (async () => {
          const current = await healthProfile()
          if (!current) return
          const restored = [target, ...(current.weighIns ?? [])]
            .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
            .slice(0, 120)
          await saveHealthProfile(withWeighIns(current, restored))
        })()
      },
    })
  }

  async function saveSettings(patch: Partial<HealthProfile>) {
    if (!profile) return
    await saveHealthProfile({ ...profile, ...patch })
  }

  /** 单条称重导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportWeight(item: WeighIn) {
    const file = buildSingleRecordExport('weight', item)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  /** 勾选导出：把这一天的称重带进挑选弹窗 */
  async function handleOpenExport() {
    if (!entry) return
    setExportInitial({ weight: [`weight:${entry.dateKey}`] })
    setExportData(await exportAllData())
  }

  /** 记录级 JSON 导入：只认称重，同一天已有就覆盖、其余追加 */
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
    if (!result.ok || recordsCount(result.file, ['weight']) === 0) {
      showToast({ message: t(result.ok ? 'records.importNone' : 'records.importBadFile') })
      return
    }
    const done = await importRecords(result.file, ['weight'])
    showToast({
      message: t('health.importWeightsDone', {
        total: done.weights.total,
        overwritten: done.weights.overwritten,
      }),
    })
  }

  /** 批量删除：称重历史是档案里的一条数组，整体换一份；撤销 = 把旧数组写回去 */
  async function handleBatchDelete() {
    if (!profile || batch.count === 0) return
    const base = profile
    const days = new Set(batch.selected.map((id) => id.slice('weight:'.length)))
    setBatchDeleting(false)
    batch.exit()
    await saveHealthProfile(
      withWeighIns(base, base.weighIns.filter((item) => !days.has(item.dateKey))),
    )
    showToast({
      message: t('health.batchWeightsDeleted', { n: days.size }),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void (async () => {
          const current = await healthProfile()
          if (!current) return
          await saveHealthProfile(withWeighIns(current, base.weighIns))
        })()
      },
    })
  }

  /** 批量导出：选中的那些天直接带进挑选弹窗 */
  async function handleBatchExport() {
    setExportInitial({ weight: batch.selected })
    setExportData(await exportAllData())
    batch.exit()
  }

  /** 批量模式下列出所有称过重的日子 */
  const batchRows = weighIns.map((item) => ({ id: `weight:${item.dateKey}`, item }))

  return (
    <div className="w-full p-4">
      {/* 日期与返回入口吸顶常驻；批量多选时不占这一条 */}
      {!batch.active && (
        <DayNav
          dayKey={dayKey}
          onChange={setDayKey}
          onPick={() => setPickerOpen(true)}
          labels={{
            prev: t('health.prevDay'),
            next: t('health.nextDay'),
            pick: t('health.pickDate'),
            today: t('health.backToToday'),
          }}
          trailing={
            <Link to="/health" className={NAV_BACK_BUTTON}>
              <span aria-hidden="true">‹</span>
              {t('nav.health')}
            </Link>
          }
        />
      )}

      {/* 按钮栏与日记 / 随记同款：等宽 2×2 实心按钮 */}
      {!batch.active && (
        <ToolbarRow className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            disabled={!profile}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {t('health.weighRecord')}
          </button>
          <button
            type="button"
            onClick={() => void handleOpenExport()}
            disabled={!entry}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {t('records.export')}
          </button>
          <button
            type="button"
            onClick={batch.enter}
            disabled={weighIns.length === 0}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {t('health.batch')}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className={SOLID_BUTTON}
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
        </ToolbarRow>
      )}

      {batch.active ? (
        <>
          {/* 跨天批量：列出所有称过重的日子，勾选后可批量删除 / 导出 */}
          <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
            {batchRows.length === 0 ? (
              <p className="m-0 p-4 text-xs text-muted">{t('health.weightBatchEmpty')}</p>
            ) : (
              batchRows.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => batch.toggle(row.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-2 ${
                    index > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <RowCheckbox
                    checked={batch.isSelected(row.id)}
                    label={formatDate(row.item.dateKey, t)}
                    onToggle={() => batch.toggle(row.id)}
                  />
                  <span className="shrink-0 tabular-nums text-fg">
                    {formatDate(row.item.dateKey, t)}
                  </span>
                  <span className="tabular-nums text-muted">
                    {formatNum(row.item.weightKg)} {t('health.weighUnit')}
                  </span>
                  <TimeMeta createdAt={row.item.createdAt} updatedAt={row.item.createdAt} />
                </button>
              ))
            )}
          </section>
          <BatchActions
            select={batch}
            ids={batchRows.map((row) => row.id)}
            unit={t('health.unitWeight')}
          >
            <button
              type="button"
              onClick={() => setBatchDeleting(true)}
              disabled={batch.count === 0}
              className={BAR_DANGER}
            >
              {t('health.weightDelete')}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchExport()}
              disabled={batch.count === 0}
              className={BAR_BUTTON}
            >
              {t('health.exportWeights')}
            </button>
          </BatchActions>
        </>
      ) : (
        <>
      {formOpen && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <input
            value={weightText}
            onChange={(event) => setWeightText(event.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder={t('health.weighUnit')}
            aria-label={t('health.weighRecord')}
            className={INPUT + ' w-32'}
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={weightText.trim() === ''}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {t('health.weightSave')}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs text-muted">
          {t('health.weightDayTitle', { date: formatDate(dayKey, t) })}
        </h2>
      </div>

      <ul className="m-0 mt-2 list-none space-y-2 p-0">
        {entry ? (
          <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-lg font-medium tabular-nums text-fg">
                {formatNum(entry.weightKg)}
                <span className="ml-1 text-xs font-normal text-muted">{t('health.weighUnit')}</span>
              </p>
              <TimeMeta createdAt={entry.createdAt} updatedAt={entry.createdAt} />
            </div>
            <button
              type="button"
              onClick={() => void handleExportWeight(entry)}
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
              {t('health.weightDelete')}
            </button>
          </li>
        ) : (
          <li className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {t('health.weightEmpty')}
          </li>
        )}
      </ul>

      {profile && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="m-0 text-xs text-muted">{t('health.weighSettings')}</h2>
          <p className="m-0 mt-1 text-xs text-muted">{t('health.weighHint')}</p>
          <div className="mt-3 text-xs text-muted">{t('health.weighDayLabel')}</div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const active = profile.weighDay === day
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => void saveSettings({ weighDay: active ? null : day })}
                  className={choiceTile(active, 'px-1 py-2 text-center text-xs')}
                >
                  {t(weighDayLabelKey(day))}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-muted">{t('health.weighTimeLabel')}</span>
            <input
              type="time"
              value={profile.weighTime}
              onChange={(event) => void saveSettings({ weighTime: event.target.value || '07:00' })}
              className={INPUT + ' w-36'}
            />
          </div>
        </section>
      )}

      {!profile && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="m-0 text-xs text-muted">{t('health.setupNeeded')}</p>
          <Link to="/health/profile" className={`${SOLID_BUTTON} mt-3`}>
            {t('health.setupAction')}
          </Link>
        </section>
      )}
        </>
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

      {pendingDelete && entry && (
        <ConfirmDialog
          title={t('health.weightDeleteTitle', { date: formatDate(dayKey, t) })}
          description={t('health.weightDeleteDesc')}
          confirmLabel={t('health.weightDelete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(false)}
        />
      )}

      {batchDeleting && (
        <ConfirmDialog
          title={t('health.batchWeightsDeleteTitle', { n: batch.count })}
          description={t('health.batchWeightsDeleteBody')}
          confirmLabel={t('health.weightDelete')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleting(false)}
        />
      )}
    </div>
  )
}
