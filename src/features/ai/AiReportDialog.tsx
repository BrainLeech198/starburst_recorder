/**
 * AI 回顾弹窗：把一周 / 一个月的记录交给模型，拿回一篇可以改的草稿。
 *
 * 和「AI 整理成日记」分开：那边写一天，这边写一段时间；
 * 生成之后可以复制，也可以直接存成今天的日记（正文进日记模块，不新开存储）。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { createEntry, exportAllData, updateContent } from '@/features/diary/diaryRepo'
import { todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { FIELD } from '@/shared/ui/inputStyles'
import { Icon } from '@/shared/ui/icons'
import { isConfigured, loadAiConfig } from './aiConfig'
import { composeReport } from './aiReport'
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
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ms, setMs] = useState(0)
  const [saving, setSaving] = useState(false)

  const ready = isConfigured(config)

  async function generate() {
    if (!ready || loading) return
    setLoading(true)
    setError('')
    try {
      const data = await exportAllData()
      const result = await composeReport(config, data, period)
      setMs(result.ms)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setText(result.content)
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
    period.kind === 'day'
      ? t('ai.reportDaily')
      : period.kind === 'week'
        ? t('ai.reportWeekly')
        : period.kind === 'month'
          ? t('ai.reportMonthly')
          : t('ai.reportYearly')

  return (
    <Modal size="lg" label={title} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-medium text-fg">{title}</h2>
        <span className="text-[11px] text-muted">{period.label}</span>
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
          <p className="mt-2 text-xs text-muted">{t('ai.reportHint')}</p>

          {text === '' && !loading && (
            <p className="mt-3 text-sm text-muted">{t('ai.reportIntro')}</p>
          )}

          {(text !== '' || loading) && (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={14}
              placeholder={loading ? t('ai.reportLoading') : t('ai.reportPlaceholder')}
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
              <Icon name="sparkles" />
              {text === '' ? t('ai.reportGenerate') : t('ai.reportRegenerate')}
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
