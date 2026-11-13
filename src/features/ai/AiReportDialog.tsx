/**
 * AI 回顾弹窗：把一周 / 一个月的记录交给模型，拿回一篇可以改的草稿。
 *
 * 和「AI 整理成日记」分开：那边写一天，这边写一段时间；
 * 生成之后可以复制，也可以直接存成今天的日记（正文进日记模块，不新开存储）。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { createEntry, updateContent } from '@/features/diary/diaryRepo'
import { assistantData } from '@/features/health/healthRepo'
import { formatDate, formatMonthDay, isDateKey, todayKey } from '@/core/utils/dateKey'
import type { AssistantData } from '@/core/db/store'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { FIELD } from '@/shared/ui/inputStyles'
import { Icon } from '@/shared/ui/icons'
import AiReportPreview from './AiReportPreview'
import AiDisclaimer from './AiDisclaimer'
import { isConfigured, loadAiConfig } from './aiConfig'
import { composeReport, reportRangeForDate } from './aiReport'
import type { ReportPeriod } from './aiReport'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function AiReportDialog({
  period,
  onClose,
}: {
  period: ReportPeriod
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [config] = useState(loadAiConfig)
  const [activePeriod, setActivePeriod] = useState(period)
  const [selectedDate, setSelectedDate] = useState(() =>
    period.kind === 'week' ? todayKey() : period.from,
  )
  const [text, setText] = useState('')
  const [reportData, setReportData] = useState<AssistantData | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ms, setMs] = useState(0)
  const [saving, setSaving] = useState(false)

  const ready = isConfigured(config)

  function changeDate(value: string) {
    if (!isDateKey(value) || (activePeriod.kind !== 'day' && activePeriod.kind !== 'week')) return
    setSelectedDate(value)
    const range = reportRangeForDate(activePeriod.kind, value)
    const label =
      activePeriod.kind === 'day'
        ? formatDate(value, t)
        : t('week.range', {
            from: formatMonthDay(range.from, t),
            to: formatMonthDay(range.to, t),
          })
    setActivePeriod({ ...activePeriod, ...range, label })
    setText('')
    setReportData(null)
    setEditing(false)
    setError('')
    setMs(0)
  }

  async function generate() {
    if (!ready || loading) return
    setLoading(true)
    setError('')
    try {
      const data = await assistantData()
      setReportData(data)
      const result = await composeReport(config, data, activePeriod)
      setMs(result.ms)
      if (!result.ok) {
        setError(result.error || t('ai.reportUnexpected'))
        return
      }
      setText(result.content)
      setEditing(false)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message.trim().slice(0, 180) : ''
      setError(detail ? `${t('ai.reportUnexpected')}\n${detail}` : t('ai.reportUnexpected'))
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    const ok = await copyText(text)
    if (ok) showToast({ message: t('ai.reportCopied') })
  }

  async function saveAsDiary() {
    const body = text.trim()
    if (body === '' || saving) return
    setSaving(true)
    try {
      const entry = await createEntry(todayKey())
      await updateContent(entry.id, body, [])
      showToast({ message: t('ai.reportSaved') })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const title =
    activePeriod.kind === 'day'
      ? t('ai.reportDaily')
      : activePeriod.kind === 'week'
        ? t('ai.reportWeekly')
        : activePeriod.kind === 'month'
          ? t('ai.reportMonthly')
          : t('ai.reportYearly')

  return (
    <Modal size="xl" label={title} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-medium text-fg">{title}</h2>
        <span className="text-[11px] text-muted">{activePeriod.label}</span>
      </div>

      {!ready ? (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm text-muted">
          <p className="m-0">{t('assistant.needConfig')}</p>
          <Link to="/me/agent/ai" className={`${OUTLINE_BUTTON} mt-2`} onClick={onClose}>
            {t('assistant.goSettings')}
          </Link>
        </div>
      ) : (
        <>
          {(activePeriod.kind === 'day' || activePeriod.kind === 'week') && (
            <label className="mt-3 block rounded-xl border border-line bg-surface-2 p-3">
              <span className="mb-1.5 block text-xs font-medium text-fg">
                {t(activePeriod.kind === 'day' ? 'ai.reportSelectDay' : 'ai.reportSelectWeek')}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => changeDate(event.currentTarget.value)}
                disabled={loading}
                className={`w-full ${FIELD}`}
              />
              {activePeriod.kind === 'week' && (
                <span className="mt-1.5 block text-[11px] text-muted">{activePeriod.label}</span>
              )}
            </label>
          )}

          <p className="mt-2 text-xs text-muted">{t('ai.reportHint')}</p>
          <AiDisclaimer className="mt-1.5" />

          {text === '' && !loading && (
            <p className="mt-3 text-sm text-muted">{t('ai.reportIntro')}</p>
          )}

          {loading && (
            <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-2 text-sm text-muted">
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                {t('ai.reportLoading')}
              </div>
              {text === '' && <div aria-hidden="true" className="mt-3 h-24 animate-pulse rounded-lg bg-surface" />}
            </div>
          )}

          {text !== '' && reportData && !editing && (
            <div className="mt-3 max-h-[55dvh] overflow-y-auto rounded-xl border border-line">
              <AiReportPreview content={text} data={reportData} period={activePeriod} title={title} />
            </div>
          )}

          {text !== '' && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-pressed={!editing}
                onClick={() => setEditing(false)}
                className={!editing ? `${OUTLINE_BUTTON} border-brand text-brand` : GHOST_BUTTON}
              >
                {t('ai.reportPreview')}
              </button>
              <button
                type="button"
                aria-pressed={editing}
                onClick={() => setEditing(true)}
                className={editing ? `${OUTLINE_BUTTON} border-brand text-brand` : GHOST_BUTTON}
              >
                {t('ai.reportEdit')}
              </button>
            </div>
          )}

          {editing && (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              placeholder={t('ai.reportPlaceholder')}
              className={`mt-3 w-full resize-y px-3 py-2 leading-relaxed ${FIELD}`}
            />
          )}

          {error !== '' && <p className="mt-2 text-xs text-danger">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className={SOLID_BUTTON}
            >
              {loading ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
              ) : (
                <Icon name="sparkles" />
              )}
              {loading ? t('ai.reportGenerating') : text === '' ? t('ai.reportGenerate') : t('ai.reportRegenerate')}
            </button>
            {ms > 0 && <span className="text-[11px] text-muted">{t('ai.reportMs', { s: (ms / 1000).toFixed(1) })}</span>}
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                disabled={text.trim() === ''}
                className={GHOST_BUTTON}
              >
                {t('ai.reportCopy')}
              </button>
              <button
                type="button"
                onClick={() => void saveAsDiary()}
                disabled={text.trim() === '' || saving}
                className={OUTLINE_BUTTON}
              >
                {t('ai.reportSave')}
              </button>
            </span>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  )
}
