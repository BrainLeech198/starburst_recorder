import { useState } from 'react'
import type { HealthTraining } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import { loadAiConfig, isConfigured } from '@/features/ai/aiConfig'
import AiDisclaimer from '@/features/ai/AiDisclaimer'
import { reviewTrainingPeriod } from './trainingReview'

export default function TrainingAiReview({
  trainings,
  from,
  to,
}: {
  trainings: HealthTraining[]
  from: string
  to: string
}) {
  const { t, locale } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [review, setReview] = useState('')

  async function run() {
    if (busy || trainings.length === 0) return
    setBusy(true)
    setError(false)
    setReview('')
    try {
      const config = loadAiConfig()
      if (!isConfigured(config)) {
        setError(true)
        return
      }
      const result = await reviewTrainingPeriod(config, trainings, from, to, locale)
      if (!result.ok || result.text === '') {
        setError(true)
        return
      }
      setReview(result.text)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t border-dashed border-line pt-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || trainings.length === 0}
        className="h-9 rounded-xl border border-line bg-surface-2 px-3 text-xs text-fg disabled:opacity-40"
      >
        {busy ? t('training.aiReviewBusy') : t('training.aiReview')}
      </button>
      {trainings.length === 0 && (
        <p className="m-0 mt-2 text-xs text-muted">{t('training.aiReviewEmpty')}</p>
      )}
      {error && <p className="m-0 mt-2 text-xs text-muted" role="status">{t('training.aiReviewFail')}</p>}
      {review && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3">
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-fg">{review}</p>
          <AiDisclaimer className="mt-2" />
        </div>
      )}
    </div>
  )
}
