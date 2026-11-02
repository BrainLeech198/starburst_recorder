/**
 * 新增 / 编辑一条日程或定期任务。
 *
 * 两种用法在同一个表单里：不重复就是一次性日程，选「每天 / 每周」就变成定期任务，
 * 周几和提醒只在对应选项下出现，避免表单上摆一堆用不上的字段。
 */
import { useState } from 'react'
import type { ScheduleItem, ScheduleRepeat } from '@/core/db/schema'
import { isDateKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { newCode, newId } from '@/core/utils/id'

const REPEATS: { id: ScheduleRepeat; label: MessageKey }[] = [
  { id: 'none', label: 'schedule.repeatNone' },
  { id: 'daily', label: 'schedule.repeatDaily' },
  { id: 'weekly', label: 'schedule.repeatWeekly' },
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
  const { t } = useI18n()
  const [title, setTitle] = useState(value?.title ?? '')
  const [dateKey, setDateKey] = useState(value?.dateKey ?? defaultDate)
  const [time, setTime] = useState(value?.time ?? '09:00')
  const [repeat, setRepeat] = useState<ScheduleRepeat>(value?.repeat ?? 'none')
  const [weeklyDays, setWeeklyDays] = useState<number[]>(value?.weeklyDays ?? [1])
  const [remind, setRemind] = useState(value?.remind ?? false)
  const [note, setNote] = useState(value?.note ?? '')
  const [touched, setTouched] = useState(false)

  const titleOk = title.trim() !== ''
  const dateOk = isDateKey(dateKey)
  const daysOk = repeat !== 'weekly' || weeklyDays.length > 0
  const valid = titleOk && dateOk && daysOk

  function toggleDay(day: number) {
    setWeeklyDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort(),
    )
  }

  function submit() {
    setTouched(true)
    if (!valid) return
    const now = Date.now()
    onSave({
      id: value?.id ?? newId(),
      code: value?.code ?? newCode(),
      dateKey,
      time: time.trim(),
      title: title.trim(),
      note,
      repeat,
      weeklyDays: repeat === 'weekly' ? weeklyDays : [],
      remind,
      doneAt: value?.doneAt ?? null,
      doneDays: value?.doneDays ?? [],
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

      <div className="mt-3 grid grid-cols-2 gap-2">
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
            onClick={() => setRepeat(item.id)}
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

      <label className="mt-3 flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={remind}
          onChange={(event) => setRemind(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-brand)]"
        />
        {t('schedule.fieldRemind')}
      </label>
      <p className="mt-1 text-[11px] text-muted">{t('schedule.remindHint')}</p>

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
        <button type="button" onClick={submit} className={SOLID_BUTTON}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
