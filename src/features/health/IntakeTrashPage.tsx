/**
 * 摄入回收站。
 *
 * 摄入的删除也只是把 deletedAt 写上，所以这里能原样恢复（日期、时间、成分快照都在）。
 * 回收站只负责恢复和彻底删掉，不参与每天的统计。
 */
import { useState } from 'react'
import type { HealthIntake } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import { purgeIntake, purgeTrashedIntakes, restoreIntake, trashedIntakes } from './healthRepo'

type Pending = { kind: 'one'; intake: HealthIntake } | { kind: 'all' }

export default function IntakeTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const intakes = useLiveQuery(() => trashedIntakes(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const loaded = intakes !== undefined
  const rows = intakes ?? []
  const isEmpty = loaded && rows.length === 0

  async function handleRestore(intake: HealthIntake) {
    await restoreIntake(intake.id)
    showToast({ message: t('intakeTrash.restored') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      await purgeIntake(target.intake.id)
      showToast({ message: t('intakeTrash.purged') })
      return
    }
    await purgeTrashedIntakes()
    showToast({ message: t('intakeTrash.cleared') })
  }

  return (
    <PageShell
      wide
      title={t('intakeTrash.title')}
      description={t('intakeTrash.description')}
      backTo="/health"
      backLabel={t('nav.health')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={`${SOLID_DANGER} disabled:opacity-40`}
        >
          {t('intakeTrash.clear')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t('intakeTrash.empty')}</p>
      ) : (
        <>
          <p className="m-0 text-xs text-muted">{t('intakeTrash.count', { n: rows.length })}</p>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {rows.map((intake) => (
              <li
                key={intake.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm text-fg">
                    {intake.name}
                    <span className="ml-2 font-mono text-[10px] text-muted">{intake.code}</span>
                    {(intake.components?.length ?? 0) > 0 && (
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                        {t('intake.partsLabel', { n: intake.components!.length })}
                      </span>
                    )}
                  </p>
                  <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
                    {t('intakeTrash.recordedAt', {
                      date: formatDate(intake.dateKey, t),
                      time: intake.time,
                    })}
                    {' · '}
                    {Math.round(intake.kcal)} {t('health.kcalUnit')} · {t('health.legendProtein')}{' '}
                    {intake.protein} g
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {t('intakeTrash.deletedAt', { at: formatStamp(intake.deletedAt ?? 0) })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleRestore(intake)}
                    className={BAR_BUTTON}
                  >
                    {t('intakeTrash.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'one', intake })}
                    className={BAR_DANGER}
                  >
                    {t('intakeTrash.purge')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'one'
              ? t('intakeTrash.purgeOneTitle', { name: pending.intake.name })
              : t('intakeTrash.clearTitle')
          }
          description={
            pending.kind === 'one' ? t('intakeTrash.purgeOneDesc') : t('intakeTrash.clearDesc')
          }
          confirmLabel={pending.kind === 'one' ? t('intakeTrash.purge') : t('intakeTrash.clear')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
