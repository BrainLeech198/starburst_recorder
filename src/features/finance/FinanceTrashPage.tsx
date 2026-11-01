/**
 * 经济回收站：删除只是打上 deletedAt，这里能原样恢复或彻底删掉。
 * 回收站里的流水不参与任何统计。
 */
import { useState } from 'react'
import EmptyState from '@/shared/ui/EmptyState'
import type { FinanceEntry } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { categoryKey } from './financeCategories'
import { purgeFinance, purgeTrashedFinance, restoreFinance, trashedFinance } from './financeRepo'

type Pending = { kind: 'one'; entry: FinanceEntry } | { kind: 'all' }

export default function FinanceTrashPage() {
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const entries = useLiveQuery(() => trashedFinance(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const loaded = entries !== undefined
  const rows = entries ?? []
  const isEmpty = loaded && rows.length === 0

  function money(value: number) {
    return `${t('finance.currency')}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value)}`
  }

  async function handleRestore(entry: FinanceEntry) {
    await restoreFinance(entry.id)
    showToast({ message: t('finance.restore') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      await purgeFinance(target.entry.id)
      showToast({ message: t('finance.purge') })
      return
    }
    await purgeTrashedFinance()
    showToast({ message: t('finance.purgeAll') })
  }

  return (
    <PageShell
      wide
      title={t('finance.trashTitle')}
      description={t('finance.trashEmpty')}
      backTo="/finance"
      backLabel={t('nav.finance')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={SOLID_DANGER + (isEmpty ? ' opacity-40' : '')}
        >
          <Icon name="trash" />
          {t('finance.purgeAll')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState icon="🧾" text={t('finance.trashEmpty')} />
      ) : (
        <ul className="m-0 mt-2 list-none space-y-2 p-0">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                  <span className="truncate">{entry.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{entry.code}</span>
                </p>
                <p className="m-0 mt-0.5 text-xs tabular-nums text-muted">
                  {formatDate(entry.dateKey, t)} {entry.time} · {t(categoryKey(entry.category))} ·{' '}
                  {entry.kind === 'income' ? '+' : '-'}
                  {money(entry.amount)}
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted">{formatStamp(entry.deletedAt ?? 0)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void handleRestore(entry)}
                  className={BAR_BUTTON}
                >
                  <Icon name="refresh" />
                  {t('finance.restore')}
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'one', entry })}
                  className={BAR_DANGER}
                >
                  <Icon name="trash" />
                  {t('finance.purge')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={t('finance.purgeTitle')}
          description={t('finance.purgeDesc')}
          confirmLabel={pending.kind === 'one' ? t('finance.purge') : t('finance.purgeAll')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
