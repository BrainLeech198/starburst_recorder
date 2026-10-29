/**
 * 睡眠回收站。
 *
 * 睡眠的删除也只是把 deletedAt 写上，所以这里能原样恢复（就寝、起床、质量、备注都在）。
 * 回收站只负责恢复和彻底删掉，不参与统计。
 */
import EmptyState from '@/shared/ui/EmptyState'
import { useState } from 'react'
import type { HealthSleep } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import { sleepMinutes, sleepParts } from './sleepMath'
import { purgeHealthSleep, purgeTrashedHealthSleeps, restoreHealthSleep, trashedHealthSleeps } from './healthRepo'

type Pending = { kind: 'one'; sleep: HealthSleep } | { kind: 'all' }

export default function SleepTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const sleeps = useLiveQuery(() => trashedHealthSleeps(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const loaded = sleeps !== undefined
  const rows = sleeps ?? []
  const isEmpty = loaded && rows.length === 0

  async function handleRestore(sleep: HealthSleep) {
    await restoreHealthSleep(sleep.id)
    showToast({ message: t('sleepTrash.restored') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      await purgeHealthSleep(target.sleep.id)
      showToast({ message: t('sleepTrash.purged') })
      return
    }
    await purgeTrashedHealthSleeps()
    showToast({ message: t('sleepTrash.cleared') })
  }

  return (
    <PageShell
      wide
      title={t('sleepTrash.title')}
      description={t('sleepTrash.description')}
      backTo="/health"
      backLabel={t('nav.health')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={SOLID_DANGER + (isEmpty ? ' opacity-40' : '')}
        >
          {t('sleepTrash.clear')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState icon="🗑️" text={t('sleepTrash.empty')} />
      ) : (
        <>
          <p className="m-0 text-xs text-muted">{t('sleepTrash.count', { n: rows.length })}</p>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {rows.map((sleep) => (
              <li
                key={sleep.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                    <span className="truncate">{formatDate(sleep.dateKey, t)}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">{sleep.code}</span>
                  </p>
                  <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
                    {sleep.bedtime} → {sleep.wakeTime} · 
                    {t('health.sleepDuration', sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime)))}
                    {sleep.quality !== null && (
                      <span className="ml-2 text-warning">{'★'.repeat(sleep.quality)}</span>
                    )}
                  </p>
                  {sleep.note !== '' && <p className="m-0 mt-0.5 text-xs text-muted">{sleep.note}</p>}
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {t('sleepTrash.deletedAt', { at: formatStamp(sleep.deletedAt ?? 0) })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleRestore(sleep)}
                    className={BAR_BUTTON}
                  >
                    {t('sleepTrash.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'one', sleep })}
                    className={BAR_DANGER}
                  >
                    {t('sleepTrash.purge')}
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
              ? t('sleepTrash.purgeOneTitle', { date: formatDate(pending.sleep.dateKey, t) })
              : t('sleepTrash.clearTitle')
          }
          description={
            pending.kind === 'one' ? t('sleepTrash.purgeOneDesc') : t('sleepTrash.clearDesc')
          }
          confirmLabel={pending.kind === 'one' ? t('sleepTrash.purge') : t('sleepTrash.clear')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
