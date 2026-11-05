/**
 * 问 AI 记一笔：打一句话，模型拆成金额、方向、分类、日期与时刻，先预览再落库。
 *
 * 没配模型或模型失败时不清空原文，给一条提示和「改用手动记录」的出口。
 */
import { useState } from 'react'
import type { FinanceDraft } from './financePhrase'
import { analyzeFinancePhrase } from './financePhrase'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import AiDisclaimer from '@/features/ai/AiDisclaimer'
import { newCode, newId } from '@/core/utils/id'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { INPUT } from '@/shared/ui/inputStyles'
import { categoryKey } from './financeCategories'
import { addFinance } from './financeRepo'

export default function FinanceAiDialog({
  defaultDate,
  onClose,
  onManual,
}: {
  defaultDate: string
  onClose: () => void
  /** 用户选择手动记：由外层打开普通表单 */
  onManual: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<FinanceDraft | null>(null)

  async function run() {
    const text = phrase.trim()
    if (text === '' || busy) return
    const config = loadAiConfig()
    if (!isConfigured(config)) {
      setError(t('finance.aiNotConfigured'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await analyzeFinancePhrase(config, text, defaultDate)
      if (result.ok && result.draft) {
        setDraft(result.draft)
      } else {
        setError(result.error || t('finance.aiNotRecognized'))
      }
    } catch (failure) {
      setError((failure as Error).message || t('finance.aiFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!draft) return
    const now = Date.now()
    await addFinance({
      id: newId(),
      code: newCode(),
      dateKey: draft.dateKey,
      time: draft.time,
      kind: draft.kind,
      category: draft.category,
      name: draft.name || t(categoryKey(draft.category)),
      amount: draft.amount,
      photo: null,
      note: draft.note,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    showToast({ message: t('finance.saved') })
    onClose()
  }

  return (
    <Modal size="sm" label={t('finance.aiTitle')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('finance.aiTitle')}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{t('finance.aiDesc')}</p>
      <AiDisclaimer className="mt-1.5" />

      {draft ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">{t('finance.category')}</span>
            <span className="text-fg">{t(categoryKey(draft.category))}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">{t('finance.amount')}</span>
            <span
              className={`text-lg tabular-nums ${draft.kind === 'income' ? 'text-brand' : 'text-fg'}`}
            >
              {draft.kind === 'income' ? '+' : '-'}
              {t('finance.currency')}
              {draft.amount}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">{t('finance.name')}</span>
            <span className="truncate text-fg">
              {draft.name || t(categoryKey(draft.category))}
            </span>
          </div>
          <p className="m-0 mt-2 text-xs tabular-nums text-muted">
            {draft.dateKey} {draft.time}
            {draft.note !== '' && ` · ${draft.note}`}
          </p>
        </div>
      ) : (
        <>
          <textarea
            autoFocus
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value)
              setError('')
            }}
            rows={3}
            placeholder={t('finance.aiPlaceholder')}
            className={`${INPUT} mt-4 w-full resize-none`}
          />
          {error !== '' && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}
          <button
            type="button"
            disabled={busy || phrase.trim() === ''}
            onClick={() => void run()}
            className={`${SOLID_BUTTON} mt-3 w-full disabled:opacity-40`}
          >
            <Icon name="sparkles" />
            {busy ? t('finance.aiParsing') : t('finance.aiParse')}
          </button>
          <button type="button" onClick={onManual} className={`${OUTLINE_BUTTON} mt-2 w-full`}>
            {t('finance.aiManual')}
          </button>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        {draft && (
          <>
            <button type="button" onClick={() => setDraft(null)} className={OUTLINE_BUTTON}>
              {t('finance.aiRetry')}
            </button>
            <button type="button" onClick={() => void confirm()} className={SOLID_BUTTON}>
              <Icon name="check" />
              {t('finance.aiConfirm')}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
