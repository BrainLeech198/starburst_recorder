/**
 * 一次训练的详情：按动作列出每组数字，底部可直接改或删。
 *
 * 格式和助手动作卡、列表摘要共用同一套：力量显示「8 次 × 40 kg」，有氧显示「20 分钟 · 5 km」。
 */
import type { HealthTraining } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, ROW_DANGER, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { formatDate } from '@/core/utils/dateKey'
import { durationOf, formatDuration, formatVolume, summarizeDay, trainingLabel } from './trainingMath'

export default function TrainingDetailDialog({
  training,
  onClose,
  onEdit,
  onDelete,
  onExport,
}: {
  training: HealthTraining
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const { t } = useI18n()
  const summary = summarizeDay([training])

  return (
    <Modal size="sm" label={t('training.detailTitle')} onClose={onClose}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-base font-medium text-fg">
            {trainingLabel(training) || t(`training.kind.${training.kind}` as MessageKey)}
          </h2>
          <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
            {formatDate(training.dateKey, t)} {training.time}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">
          {t(`training.kind.${training.kind}` as MessageKey)}
        </span>
      </div>

      <p className="m-0 mt-3 text-2xl font-medium tabular-nums text-fg">
        {summary.volumeKg > 0 ? formatVolume(summary.volumeKg) : formatDuration(durationOf(training), t)}
      </p>
      <p className="m-0 mt-1 text-xs tabular-nums text-muted">
        {t('training.totalSets')} {summary.totalSets} · {t('training.totalReps')} {summary.totalReps}
        {' · '}
        {t('training.totalDuration')} {formatDuration(durationOf(training), t)}
        {training.feeling !== null && ` · ${t('training.feeling')} ${training.feeling}`}
      </p>

      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {training.exercises.map((exercise) => (
          <li key={exercise.id} className="rounded-xl border border-line bg-surface-2 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-fg">{exercise.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {t(`training.muscle.${exercise.muscle}` as MessageKey)}
              </span>
            </div>
            {exercise.sets.length > 0 && (
              <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs tabular-nums text-muted">
                {exercise.sets.map((set, index) => (
                  <li key={index}>
                    {set.reps !== null ? `${set.reps} ${t('training.reps')}` : ''}
                    {set.weightKg !== null ? ` × ${set.weightKg} ${t('training.weightKg')}` : ''}
                    {set.reps === null && set.weightKg === null ? '—' : ''}
                    {set.rpe !== null ? ` @${set.rpe}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {(exercise.durationMin !== null || exercise.distanceKm !== null) && (
              <p className="m-0 mt-1 text-xs tabular-nums text-muted">
                {exercise.durationMin !== null && formatDuration(exercise.durationMin, t)}
                {exercise.distanceKm !== null && ` · ${exercise.distanceKm} ${t('training.distanceKm')}`}
              </p>
            )}
            {exercise.note !== '' && <p className="m-0 mt-1 text-xs text-muted">{exercise.note}</p>}
          </li>
        ))}
      </ul>

      {training.note !== '' && (
        <p className="m-0 mt-3 text-xs text-fg">{training.note}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.close')}
        </button>
        <button type="button" onClick={onExport} title={t('records.export')} className={GHOST_BUTTON}>
          JSON
          <span className="sr-only">{t('records.export')}</span>
        </button>
        <button type="button" onClick={onDelete} className={ROW_DANGER}>
          {t('common.delete')}
        </button>
        <button type="button" onClick={onEdit} className={SOLID_BUTTON}>
          <Icon name="edit" />
          {t('training.editTitle')}
        </button>
      </div>
    </Modal>
  )
}
