/**
 * 日程页：上面是这一天的安排，下面是长期在用的定期任务。
 *
 * 一次性日程和定期任务共用一条时间轴：定期任务不预先展开成很多条记录，
 * 每个日期现场算「今天该不该做」，所以改一次周几，过去的勾也不会跟着变。
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { ScheduleItem } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import EmptyState from '@/shared/ui/EmptyState'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import DayNav from '@/shared/ui/DayNav'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { ROW_ACTION, SOLID_SMALL_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
import ViewTabs from '@/features/calendar/ViewTabs'
import ScheduleDialog from './ScheduleDialog'
import {
  donePatch,
  isDoneOn,
  occurrencesOn,
} from './scheduleMath'
import {
  removeSchedule,
  saveSchedule,
  schedules,
} from './scheduleRepo'

const LIST =
  'm-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0'

export default function SchedulePage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [params, setParams] = useSearchParams()
  const dateParam = params.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()

  const items = useLiveQuery(() => schedules(), []) ?? []

  const [dialog, setDialog] = useState<{ value: ScheduleItem | null } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ScheduleItem | null>(null)

  const today = occurrencesOn(items, dayKey)
  const recurring = items.filter((item) => item.repeat !== 'none')

  /** 换天把日期写进地址栏：从日历 / 一天一页跳进来都停在同一处 */
  function goDay(next: string) {
    setParams({ date: next }, { replace: true })
  }

  const swipe = useDaySwipe(
    () => goDay(shiftDay(dayKey, -1)),
    () => goDay(shiftDay(dayKey, 1)),
  )

  /** 重复方式的短说明：一次性 / 每天 / 每周一、三 */
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

  async function toggleDone(item: ScheduleItem) {
    await saveSchedule({ ...item, ...donePatch(item, dayKey, !isDoneOn(item, dayKey)) })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await removeSchedule(pendingDelete.id)
    setPendingDelete(null)
    showToast({ message: t('schedule.deleted') })
  }

  function isTodayRow(item: ScheduleItem) {
    return isDoneOn(item, dayKey)
  }

  return (
    <div
      className={`mx-auto w-full max-w-2xl p-4 ${swipe.animationClass}`}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-1.5 text-lg font-medium text-fg">
          <Icon name="list" className="h-4 w-4 shrink-0" />
          {t('schedule.title')}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/schedule/trash"
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-brand"
          >
            <Icon name="trash" className="h-3.5 w-3.5 shrink-0" />
            {t('schedule.trash')}
          </Link>
          <button
            type="button"
            onClick={() => setDialog({ value: null })}
            className={SOLID_SMALL_BUTTON}
          >
            <Icon name="plus" className="h-3.5 w-3.5 shrink-0" />
            {t('schedule.add')}
          </button>
        </div>
      </header>

      <ViewTabs active="schedule" dayKey={dayKey} />

      <DayNav
        dayKey={dayKey}
        onChange={goDay}
        onPick={() => setPickerOpen(true)}
        inset={false}
        labels={{
          prev: t('health.prevDay'),
          next: t('health.nextDay'),
          pick: t('health.pickDate'),
          today: t('health.backToToday'),
        }}
      />

      <h2 className="mb-2 mt-3 flex items-center gap-2 text-xs font-medium text-muted">
        <span>{t('schedule.daySection', { date: formatDate(dayKey, t) })}</span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] leading-none">
          {today.length}
        </span>
      </h2>

      {today.length === 0 ? (
        <EmptyState icon="🗓️" text={t('schedule.dayEmpty')} />
      ) : (
        <ul className={LIST}>
          {today.map((item) => {
            const done = isTodayRow(item)
            return (
              <li key={item.id} className="flex items-start gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void toggleDone(item)}
                  aria-pressed={done}
                  aria-label={done ? t('schedule.markUndone') : t('schedule.markDone')}
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
                  <div className="mt-0.5 text-[11px] text-muted">
                    {repeatLabel(item)}
                    {item.remind && ` · ${t('schedule.remindOn')}`}
                    {item.note && ` · ${item.note}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDialog({ value: item })}
                  className={ROW_ACTION}
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(item)}
                  className={ROW_ACTION}
                >
                  {t('common.delete')}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h2 className="mb-2 mt-6 flex items-center gap-2 text-xs font-medium text-muted">
        <span>{t('schedule.recurringSection')}</span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] leading-none">
          {recurring.length}
        </span>
      </h2>

      {recurring.length === 0 ? (
        <EmptyState icon="🔁" text={t('schedule.recurringEmpty')} />
      ) : (
        <ul className={LIST}>
          {recurring.map((item) => (
            <li key={item.id} className="flex items-start gap-2 px-3 py-2">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted"
              >
                <Icon name="refresh" className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-fg">
                  {item.time && <span className="mr-1.5 text-muted">{item.time}</span>}
                  {item.title}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {repeatLabel(item)}
                  {item.remind && ` · ${t('schedule.remindOn')}`}
                </div>
              </div>
              <button type="button" onClick={() => setDialog({ value: item })} className={ROW_ACTION}>
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                className={ROW_ACTION}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <ScheduleDialog
          value={dialog.value}
          defaultDate={dayKey}
          onCancel={() => setDialog(null)}
          onSave={(item) => {
            void saveSchedule(item)
            setDialog(null)
            showToast({ message: t('schedule.saved') })
          }}
        />
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dayKey}
          onConfirm={(next) => {
            setPickerOpen(false)
            goDay(next)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('schedule.deleteTitle')}
          description={t('schedule.deleteDesc')}
          confirmLabel={t('common.delete')}
          tone="warn"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
