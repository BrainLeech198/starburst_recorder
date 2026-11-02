/**
 * 日程回收站：删除只是打上 deletedAt，这里能原样恢复或彻底删掉。
 * 回收站里的日程不参与任何统计与提醒。
 */
import { useState } from 'react'
import EmptyState from '@/shared/ui/EmptyState'
import type { ScheduleItem } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import {
  purgeSchedule,
  purgeTrashedSchedules,
  restoreSchedule,
  trashedSchedules,
} from './scheduleRepo'

type Pending = { kind: 'one'; item: ScheduleItem } | { kind: 'all' }

export default function ScheduleTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const entries = useLiveQuery(() => trashedSchedules(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const loaded = entries !== undefined
  const rows = entries ?? []
  const isEmpty = loaded && rows.length === 0

  function repeatLabel(item: ScheduleItem): string {
    if (item.repeat === 'daily') return t('schedule.everyDay')
    if (item.repeat === 'weekly') {
      const names = item.weeklyDays
        .map((day) => t(('date.weekdayShort' + (day % 7)) as MessageKey))
        .join('、')
      return t('schedule.everyWeek', { days: names })
    }
    return t('schedule.onlyOnce')
  }

  async function handleRestore(item: ScheduleItem) {
    await restoreSchedule(item.id)
    showToast({ message: t('schedule.restore') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      await purgeSchedule(target.item.id)
      showToast({ message: t('schedule.purge') })
      return
    }
    await purgeTrashedSchedules()
    showToast({ message: t('schedule.purgeAll') })
  }

  return (
    <PageShell
      wide
      title={t('schedule.trashTitle')}
      description={t('schedule.trashHint')}
      backTo="/schedule"
      backLabel={t('schedule.title')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={SOLID_DANGER + (isEmpty ? ' opacity-40' : '')}
        >
          <Icon name="trash" />
          {t('schedule.purgeAll')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState icon="🗓️" text={t('schedule.trashEmpty')} />
      ) : (
        <ul className="m-0 mt-2 list-none space-y-2 p-0">
          {rows.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                  <span className="truncate">
                    {item.time && <span className="mr-1.5 text-muted">{item.time}</span>}
                    {item.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{item.code}</span>
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted">
                  {formatDate(item.dateKey, t)} · {repeatLabel(item)}
                </p>
                {item.note !== '' && (
                  <p className="m-0 mt-0.5 truncate text-xs text-muted">{item.note}</p>
                )}
                <p className="m-0 mt-0.5 text-xs text-muted">{formatStamp(item.deletedAt ?? 0)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void handleRestore(item)}
                  className={BAR_BUTTON}
                >
                  <Icon name="refresh" />
                  {t('schedule.restore')}
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'one', item })}
                  className={BAR_DANGER}
                >
                  <Icon name="trash" />
                  {t('schedule.purge')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={t('schedule.purgeTitle')}
          description={t('schedule.purgeDesc')}
          confirmLabel={pending.kind === 'one' ? t('schedule.purge') : t('schedule.purgeAll')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
