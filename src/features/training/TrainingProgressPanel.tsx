import { useState } from 'react'
import type { HealthTraining } from '@/core/db/schema'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { exerciseProgressOf } from './trainingProgress'

const MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'fullBody', 'cardio']

export default function TrainingProgressPanel({
  trainings,
}: {
  trainings: HealthTraining[]
}) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const progress = exerciseProgressOf(trainings)
  const counts: Record<string, number> = {}
  for (const training of trainings) {
    if (training.deletedAt !== null) continue
    for (const exercise of training.exercises ?? []) {
      counts[exercise.muscle] = (counts[exercise.muscle] ?? 0) + 1
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="m-0 text-sm font-medium text-fg">{t('training.progressTitle')}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{t('training.progressRange', { n: 30 })}</p>

      <div className="mt-3">
        <h3 className="m-0 text-xs font-medium text-fg">{t('training.coverageTitle')}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MUSCLES.map((muscle) => (
            <span key={muscle} className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">
              {t(`training.muscle.${muscle}` as MessageKey)} {counts[muscle] ?? 0}
            </span>
          ))}
          {(counts.other ?? 0) > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">
              {t('training.unclassifiedCoverage', { n: counts.other })}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {progress.length === 0 ? (
          <p className="m-0 py-3 text-center text-xs text-muted">{t('training.progressEmpty')}</p>
        ) : progress.map((item) => {
          const reps = item.points.map((point) => point.reps).filter((value): value is number => value !== null)
          const maxReps = reps.length ? Math.max(...reps) : null
          const loads = item.points.map((point) => point.loadKg).filter((value): value is number => value !== null)
          const maxLoad = loads.length ? Math.max(...loads) : null
          const chart = reps.slice().reverse()
          const chartMin = chart.length ? Math.min(...chart) : 0
          const chartSpan = Math.max((chart.length ? Math.max(...chart) : 0) - chartMin, 1)
          const coordinates = chart.map((value, index) => {
            const x = chart.length < 2 ? 50 : 6 + (88 * index) / (chart.length - 1)
            const y = 30 - ((value - chartMin) / chartSpan) * 24
            return `${x},${y}`
          })
          return (
            <article key={item.name} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="m-0 truncate text-sm font-medium text-fg">{item.name}</h3>
                  <p className="m-0 mt-1 text-[11px] text-muted">
                    {t('training.maxReps')}: {maxReps ?? '—'} · {t('training.maxLoad')}: {maxLoad === null ? t('training.volumeUnavailable') : `${maxLoad} kg`}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">{item.points.length}</span>
              </div>
              {coordinates.length > 1 && (
                <svg viewBox="0 0 100 34" role="img" aria-label={t('training.progressTitle')} className="mt-2 h-12 w-full">
                  <polyline points={coordinates.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" className="text-brand" />
                </svg>
              )}
              <ol className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[10px] text-muted">
                {item.points.slice(0, 4).map((point, index) => (
                  <li key={`${point.dateKey}:${point.time}:${index}`}>
                    {formatDate(point.dateKey, t)} · {point.reps ?? '—'} / {point.loadKg === null ? '—' : `${point.loadKg} kg`}
                  </li>
                ))}
              </ol>
              {item.plateau && !dismissed[item.name] && (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-surface-2 p-2">
                  <p className="m-0 text-[11px] text-muted">{t('training.plateauHint')}</p>
                  <button
                    type="button"
                    onClick={() => setDismissed((current) => ({ ...current, [item.name]: true }))}
                    className="shrink-0 text-[11px] text-brand"
                  >
                    {t('training.dismissHint')}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
