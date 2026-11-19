/** 首页今日清单：复用日程的重复规则、完成记录与日期回看。 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryImage, ScheduleItem } from '@/core/db/schema'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { Icon } from '@/shared/ui/icons'
import { checkInFor, checkInPatch, donePatch, isDoneOn, occurrencesOn } from '@/features/schedule/scheduleMath'
import { saveSchedule, schedules } from '@/features/schedule/scheduleRepo'
import ScheduleCheckInDialog from '@/features/schedule/ScheduleCheckInDialog'

export default function TodayScheduleCard() {
  const { t } = useI18n()
  const dayKey = todayKey()
  const scheduleResult = useLiveQuery(() => schedules(), [])
  const [checkInItem, setCheckInItem] = useState<ScheduleItem | null>(null)
  const items = useMemo(
    () => occurrencesOn(scheduleResult ?? [], dayKey),
    [scheduleResult, dayKey],
  )
  const doneCount = items.reduce((count, item) => count + Number(isDoneOn(item, dayKey)), 0)
  const progress = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100)
  const allDone = items.length > 0 && doneCount === items.length
  const scheduleUrl = `/schedule?date=${dayKey}`

  async function saveCheckIn(note: string, photo: DiaryImage | null) {
    if (!checkInItem) return
    await saveSchedule({
      ...checkInItem,
      ...donePatch(checkInItem, dayKey, true),
      ...checkInPatch(checkInItem, dayKey, { note, photo }),
    })
  }

  async function undoCheckIn() {
    if (!checkInItem) return
    await saveSchedule({
      ...checkInItem,
      ...donePatch(checkInItem, dayKey, false),
    })
  }

  return (
    <section
      aria-labelledby="home-today-checklist-title"
      className="mt-5 w-full rounded-2xl border border-brand/25 bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="home-today-checklist-title"
          className="m-0 flex items-center gap-2 text-base font-medium text-fg"
        >
          <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />
          {t('home.todayChecklist.title')}
        </h2>
        <Link
          to={scheduleUrl}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-brand transition-colors hover:text-fg"
        >
          {t(
            scheduleResult !== undefined && items.length === 0
              ? 'home.todayChecklist.add'
              : 'home.todayChecklist.history',
          )}
        </Link>
      </div>

      {scheduleResult === undefined ? (
        <div aria-hidden="true" className="mt-3 space-y-2">
          <div className="h-3 w-2/5 rounded bg-surface-2" />
          <div className="h-10 rounded-xl bg-surface-2" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              {items.length === 0
                ? t('home.todayChecklist.empty')
                : t('home.todayChecklist.progress', { done: doneCount, total: items.length })}
            </span>
            {items.length > 0 && <span>{progress}%</span>}
          </div>

          {items.length > 0 && (
            <div
              role="progressbar"
              aria-label={t('home.todayChecklist.progress', { done: doneCount, total: items.length })}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={doneCount}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {items.length > 0 && (
            <ul className="m-0 mt-2 list-none divide-y divide-line p-0">
              {items.map((item) => {
                const done = isDoneOn(item, dayKey)
                return (
                  <li key={item.id} className="flex items-start gap-2 py-2">
                    <button
                      type="button"
                      onClick={() => setCheckInItem(item)}
                      aria-pressed={done}
                      aria-label={t(
                        done
                          ? 'schedule.checkIn.open'
                          : 'home.todayChecklist.markDone',
                        { name: item.title },
                      )}
                      className={[
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        done ? 'border-brand bg-brand text-on-brand' : 'border-line text-transparent',
                      ].join(' ')}
                    >
                      <Icon name="check" className="h-3 w-3" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={done ? 'text-sm text-muted line-through' : 'text-sm text-fg'}>
                        {item.time && <span className="mr-1.5 text-muted">{item.time}</span>}
                        {item.title}
                      </div>
                      {item.note && <p className="m-0 mt-0.5 text-xs text-muted">{item.note}</p>}
                      {checkInFor(item, dayKey)?.note && (
                        <p className="m-0 mt-0.5 line-clamp-2 text-xs text-brand">
                          {checkInFor(item, dayKey)?.note}
                        </p>
                      )}
                      {checkInFor(item, dayKey)?.photo && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                          <Icon name="image" className="h-3 w-3" />
                          {t('schedule.checkIn.photoAdded')}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {allDone && (
            <p className="mb-0 mt-2 text-xs font-medium text-brand">
              {t('home.todayChecklist.complete')}
            </p>
          )}
        </>
      )}
      {checkInItem && (
        <ScheduleCheckInDialog
          title={checkInItem.title}
          dateKey={dayKey}
          existing={checkInFor(checkInItem, dayKey)}
          completed={isDoneOn(checkInItem, dayKey)}
          onClose={() => setCheckInItem(null)}
          onSave={saveCheckIn}
          onUndo={undoCheckIn}
        />
      )}
    </section>
  )
}
