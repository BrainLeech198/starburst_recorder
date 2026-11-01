/**
 * 训练回收站：删除只是打上 deletedAt，这里能原样恢复或彻底删掉。
 * 回收站里的记录不参与任何统计。
 */
import { useState } from 'react'
import EmptyState from '@/shared/ui/EmptyState'
import type { HealthTraining } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { summarizeDay, trainingLabel } from './trainingMath'
import {
  purgeHealthTraining,
  purgeTrashedHealthTrainings,
  restoreHealthTraining,
  trashedHealthTrainings,
} from './trainingRepo'

type Pending = { kind: 'one'; training: HealthTraining } | { kind: 'all' }

export default function TrainingTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const trainings = useLiveQuery(() => trashedHealthTrainings(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const loaded = trainings !== undefined
  const rows = trainings ?? []
  const isEmpty = loaded && rows.length === 0

  async function handleRestore(training: HealthTraining) {
    await restoreHealthTraining(training.id)
    showToast({ message: t('training.restore') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      await purgeHealthTraining(target.training.id)
      showToast({ message: t('training.purge') })
      return
    }
    await purgeTrashedHealthTrainings()
    showToast({ message: t('training.purgeAll') })
  }

  return (
    <PageShell
      wide
      title={t('training.trashTitle')}
      description={t('training.trashEmpty')}
      backTo="/health/training"
      backLabel={t('training.title')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={SOLID_DANGER + (isEmpty ? ' opacity-40' : '')}
        >
          <Icon name="trash" />
          {t('training.purgeAll')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState icon="🗑️" text={t('training.trashEmpty')} />
      ) : (
        <ul className="m-0 mt-2 list-none space-y-2 p-0">
          {rows.map((training) => {
            const summary = summarizeDay([training])
            return (
              <li
                key={training.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                    <span className="truncate">
                      {trainingLabel(training) ||
                        t(`training.kind.${training.kind}` as MessageKey)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">{training.code}</span>
                  </p>
                  <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
                    {formatDate(training.dateKey, t)} {training.time}
                    {summary.totalSets > 0 && ` · ${t('training.setCount', { n: summary.totalSets })}`}
                  </p>
                  {training.note !== '' && (
                    <p className="m-0 mt-0.5 truncate text-xs text-muted">{training.note}</p>
                  )}
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {formatStamp(training.deletedAt ?? 0)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleRestore(training)}
                    className={BAR_BUTTON}
                  >
                    <Icon name="refresh" />
                    {t('training.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'one', training })}
                    className={BAR_DANGER}
                  >
                    <Icon name="trash" />
                    {t('training.purge')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={t('training.purgeTitle')}
          description={t('training.purgeDesc')}
          confirmLabel={pending.kind === 'one' ? t('training.purge') : t('training.purgeAll')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
