/**
 * 新增 / 编辑一条日程或定期任务。
 *
 * 两种用法在同一个表单里：不重复就是一次性日程，选「每天 / 每周」就变成定期任务，
 * 周几和提醒只在对应选项下出现，避免表单上摆一堆用不上的字段。
 */
import { useState } from 'react'
import type { ScheduleItem, ScheduleRepeat } from '@/core/db/schema'
import { isDateKey, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { newCode, newId } from '@/core/utils/id'
import { requestScheduleReminderPermission } from './scheduleNotify'

const REPEATS: { id: ScheduleRepeat; label: MessageKey }[] = [
  { id: 'none', label: 'schedule.repeatNone' },
  { id: 'daily', label: 'schedule.repeatDaily' },
  { id: 'weekly', label: 'schedule.repeatWeekly' },
  { id: 'monthly', label: 'schedule.repeatMonthly' },
  { id: 'yearly', label: 'schedule.repeatYearly' },
]

/** 周一开头：1=周一 … 7=周日 */
const WEEKDAYS: { day: number; label: MessageKey }[] = [
  { day: 1, label: 'date.weekdayShort1' },
  { day: 2, label: 'date.weekdayShort2' },
  { day: 3, label: 'date.weekdayShort3' },
  { day: 4, label: 'date.weekdayShort4' },
  { day: 5, label: 'date.weekdayShort5' },
  { day: 6, label: 'date.weekdayShort6' },
  { day: 7, label: 'date.weekdayShort0' },
]

export default function ScheduleDialog({
  value,
  defaultDate,
  onSave,
  onCancel,
}: {
  /** null 表示新增 */
  value: ScheduleItem | null
  defaultDate: string
  onSave: (item: ScheduleItem) => void
  onCancel: () => void
}) {
  const { t, locale } = useI18n()
  const [title, setTitle] = useState(value?.title ?? '')
  const [dateKey, setDateKey] = useState(value?.dateKey ?? defaultDate)
  const [endDate, setEndDate] = useState(value?.endDate ?? '')
  const [time, setTime] = useState(value?.time ?? '09:00')
  const [repeat, setRepeat] = useState<ScheduleRepeat>(value?.repeat ?? 'none')
  const [weeklyDays, setWeeklyDays] = useState<number[]>(value?.weeklyDays ?? [1])
  const [monthlyDays, setMonthlyDays] = useState<number[]>(value?.monthlyDays ?? [1])
  const [yearlyDates, setYearlyDates] = useState<string[]>(value?.yearlyDates ?? [])
  const [yearlyMonth, setYearlyMonth] = useState(value?.yearlyDates?.[0]?.slice(0, 2) ?? '01')
  const [remind, setRemind] = useState(value?.remind ?? false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [remindPermissionBlocked, setRemindPermissionBlocked] = useState(false)
  const [note, setNote] = useState(value?.note ?? '')
  const [touched, setTouched] = useState(false)

  const titleOk = title.trim() !== ''
  const dateOk = isDateKey(dateKey)
  const endDateOk = repeat === 'none' || (isDateKey(endDate) && endDate >= dateKey)
  const daysOk = repeat !== 'weekly' || weeklyDays.length > 0
  const monthlyDaysOk = repeat !== 'monthly' || monthlyDays.length > 0
  const yearlyDatesOk = repeat !== 'yearly' || yearlyDates.length > 0
  const valid = titleOk && dateOk && endDateOk && daysOk && monthlyDaysOk && yearlyDatesOk

  function toggleDay(day: number) {
    setWeeklyDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort(),
    )
  }

  function toggleMonthlyDay(day: number) {
    setMonthlyDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b),
    )
  }

  function toggleYearlyDate(day: number) {
    const date = `${yearlyMonth}-${String(day).padStart(2, '0')}`
    setYearlyDates((current) =>
      current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort(),
    )
  }

  async function changeReminder(next: boolean) {
    setRemindPermissionBlocked(false)
    if (!next) {
      setRemind(false)
      return
    }
    setReminderBusy(true)
    try {
      const granted = await requestScheduleReminderPermission()
      setRemind(granted)
      setRemindPermissionBlocked(!granted)
    } finally {
      setReminderBusy(false)
    }
  }

  function submit() {
    setTouched(true)
    if (!valid) return
    const now = Date.now()
    onSave({
      id: value?.id ?? newId(),
      code: value?.code ?? newCode(),
      dateKey,
      endDate: repeat === 'none' ? null : endDate,
      time: time.trim(),
      title: title.trim(),
      note,
      repeat,
      weeklyDays: repeat === 'weekly' ? weeklyDays : [],
      monthlyDays: repeat === 'monthly' ? monthlyDays : [],
      yearlyDates: repeat === 'yearly' ? yearlyDates : [],
      remind,
      doneAt: value?.doneAt ?? null,
      doneDays: value?.doneDays ?? [],
      checkIns: value?.checkIns ?? [],
      createdAt: value?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
  }

  return (
    <Modal size="sm" label={value ? t('schedule.editTitle') : t('schedule.addTitle')} onClose={onCancel}>
      <h2 className="m-0 text-base font-medium text-fg">
        {value ? t('schedule.editTitle') : t('schedule.addTitle')}
      </h2>

      <label className="mt-3 block text-xs text-muted" htmlFor="schedule-title">
        {t('schedule.fieldTitle')}
      </label>
      <input
        id="schedule-title"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('schedule.titlePlaceholder')}
        className={`mt-1 ${INPUT}`}
      />
      {touched && !titleOk && <p className="mt-1 text-xs text-danger">{t('schedule.titleRequired')}</p>}

      <div className={`mt-3 grid gap-2 ${repeat === 'none' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {repeat === 'none' && (
          <div>
            <label className="block text-xs text-muted" htmlFor="schedule-date">
              {t('schedule.fieldDate')}
            </label>
            <input
              id="schedule-date"
              type="date"
              value={dateKey}
              onChange={(event) => setDateKey(event.target.value)}
              className={`mt-1 ${INPUT}`}
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-muted" htmlFor="schedule-time">
            {t('schedule.fieldTime')}
          </label>
          <input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={`mt-1 ${INPUT}`}
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted">{t('schedule.timeHint')}</p>

      <div className="mt-3 text-xs text-muted">{t('schedule.fieldRepeat')}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {REPEATS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (repeat === 'none' && item.id !== 'none') setDateKey(todayKey())
              if (repeat !== 'none' && item.id === 'none') setDateKey(defaultDate)
              setRepeat(item.id)
            }}
            aria-pressed={repeat === item.id}
            className={[
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              repeat === item.id ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
            ].join(' ')}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {repeat === 'weekly' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {WEEKDAYS.map((item) => (
            <button
              key={item.day}
              type="button"
              onClick={() => toggleDay(item.day)}
              aria-pressed={weeklyDays.includes(item.day)}
              className={[
                'h-8 w-8 rounded-lg border text-xs transition-colors',
                weeklyDays.includes(item.day)
                  ? 'border-brand text-brand'
                  : 'border-line text-muted hover:text-fg',
              ].join(' ')}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      )}
      {touched && !daysOk && <p className="mt-1 text-xs text-danger">{t('schedule.daysRequired')}</p>}

      {repeat === 'monthly' && (
        <div className="mt-2">
          <div className="mb-1 text-xs text-muted">{t('schedule.monthlyDaysLabel')}</div>
          <p className="mb-1 text-[11px] text-muted">{t('schedule.monthlyDaysHint')}</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleMonthlyDay(day)}
                aria-pressed={monthlyDays.includes(day)}
                className={[
                  'h-8 rounded-lg border text-xs transition-colors',
                  monthlyDays.includes(day) ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
                ].join(' ')}
              >
                {day}
              </button>
            ))}
          </div>
          {touched && !monthlyDaysOk && <p className="mt-1 text-xs text-danger">{t('schedule.monthlyDaysRequired')}</p>}
        </div>
      )}

      {repeat === 'yearly' && (
        <div className="mt-2">
          <label className="block text-xs text-muted" htmlFor="schedule-yearly-month">
            {t('schedule.yearlyMonthLabel')}
          </label>
          <p className="mt-1 text-[11px] text-muted">{t('schedule.yearlyDatesHint')}</p>
          <select
            id="schedule-yearly-month"
            value={yearlyMonth}
            onChange={(event) => setYearlyMonth(event.target.value)}
            className={`mt-1 ${INPUT}`}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={String(month).padStart(2, '0')}>
                {new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2000, month - 1, 1))}
              </option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {Array.from({ length: new Date(2000, Number(yearlyMonth), 0).getDate() }, (_, index) => index + 1).map((day) => {
              const selected = yearlyDates.includes(`${yearlyMonth}-${String(day).padStart(2, '0')}`)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleYearlyDate(day)}
                  aria-pressed={selected}
                  className={[
                    'h-8 rounded-lg border text-xs transition-colors',
                    selected ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
                  ].join(' ')}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {yearlyDates.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-muted">{t('schedule.yearlyDatesLabel')}</div>
              <div className="flex flex-wrap gap-1">
                {yearlyDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setYearlyDates((current) => current.filter((item) => item !== date))}
                    aria-label={`${date} ×`}
                    className="rounded-full border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            </div>
          )}
          {touched && !yearlyDatesOk && <p className="mt-1 text-xs text-danger">{t('schedule.yearlyDatesRequired')}</p>}
        </div>
      )}

      {repeat !== 'none' && (
        <div className="mt-3">
          <label className="block text-xs text-muted" htmlFor="schedule-end-date">
            {t('schedule.fieldEndDate')}
          </label>
          <input
            id="schedule-end-date"
            type="date"
            value={endDate}
            min={dateKey || undefined}
            onChange={(event) => setEndDate(event.target.value)}
            className={`mt-1 ${INPUT}`}
          />
          <p className="mt-1 text-[11px] text-muted">{t('schedule.endDateHint')}</p>
          {touched && !isDateKey(endDate) && (
            <p className="mt-1 text-xs text-danger">{t('schedule.endDateRequired')}</p>
          )}
          {touched && isDateKey(endDate) && endDate < dateKey && (
            <p className="mt-1 text-xs text-danger">{t('schedule.endDateBeforeStart')}</p>
          )}
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={remind}
          disabled={reminderBusy}
          onChange={(event) => void changeReminder(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-brand)]"
        />
        {t('schedule.fieldRemind')}
      </label>
      <p className="mt-1 text-[11px] text-muted">{t('schedule.remindHint')}</p>
      {remindPermissionBlocked && <p className="mt-1 text-xs text-danger">{t('schedule.remindPermissionBlocked')}</p>}

      <label className="mt-3 block text-xs text-muted" htmlFor="schedule-note">
        {t('schedule.fieldNote')}
      </label>
      <textarea
        id="schedule-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        className={`mt-1 ${INPUT}`}
      />

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={submit} disabled={reminderBusy} className={SOLID_BUTTON}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
