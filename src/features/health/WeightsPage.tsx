/**
 * 体重记录页：日期导航、按钮行、这一天的称重。
 *
 * 称重历史存在身体档案的 weighIns 里，一天最多一条；所以这里按天看，
 * 不在首页铺「最近称重」列表。称重日 / 提醒时刻这类「管理」也搬到这里。
 */
import TimeMeta from '@/shared/ui/TimeMeta'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { HealthProfile, WeighIn } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { INPUT } from '@/shared/ui/inputStyles'
import { BAR_BUTTON, BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import HealthDayNav from './HealthDayNav'
import { formatNum, round2 } from './healthMath'
import { exportAllData, healthProfile, saveHealthProfile } from './healthRepo'
import type { BackupData } from './healthRepo'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import RecordExportDialog from '@/features/records/RecordExportDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
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
    setExportData(await exportAllData())
  }

  return (
    <div className="w-full p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <HealthDayNav dayKey={dayKey} onChange={setDayKey} onPick={() => setPickerOpen(true)} />
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
          className={`${OUTLINE_BUTTON} justify-self-start disabled:opacity-40`}
        >
          {t('records.export')}
        </button>
      </ToolbarRow>

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

      {exportData && (
        <RecordExportDialog
          data={exportData}
          initial={{ weight: [`weight:${dayKey}`] }}
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
    </div>
  )
}
