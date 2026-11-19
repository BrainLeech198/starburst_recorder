import type { HealthTraining } from '@/core/db/schema'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { durationOf, formatDuration, formatVolume, summarizeDay } from './trainingMath'

export interface TrainingPostcardFact {
  id: string
  label: string
  value: string
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** Keep the training card concise while using the same totals as the training detail view. */
export function trainingPostcardFacts(training: HealthTraining, t: Translate): TrainingPostcardFact[] {
  const summary = summarizeDay([training])
  const facts: TrainingPostcardFact[] = [
    {
      id: 'kind',
      label: t('training.exerciseType'),
      value: t(`training.kind.${training.kind}` as MessageKey),
    },
    {
      id: 'duration',
      label: t('training.totalDuration'),
      value: formatDuration(durationOf(training), t),
    },
  ]

  if (summary.volumeKg > 0) {
    facts.push({ id: 'volume', label: t('training.volume'), value: formatVolume(summary.volumeKg) })
  }
  if (summary.totalSets > 0) {
    facts.push({
      id: 'sets',
      label: t('training.totalSets'),
      value: `${summary.totalSets} · ${summary.totalReps} ${t('training.totalReps')}`,
    })
  }
  const exerciseNames = training.exercises.map((exercise) => exercise.name.trim()).filter(Boolean).slice(0, 4)
  if (exerciseNames.length > 0) {
    facts.push({ id: 'exercises', label: t('training.exerciseName'), value: exerciseNames.join(' · ') })
  }
  if (training.feeling !== null) {
    facts.push({ id: 'feeling', label: t('training.feeling'), value: String(training.feeling) })
  }
  return facts.slice(0, 6)
}
