import { useEffect, useState } from 'react'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'
import type { FocusEvent as ReactFocusEvent } from 'react'
import { monthGrid, toDateKey, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { INPUT_NARROW } from '@/shared/ui/inputStyles'
import { everyEntry, everyStamp } from './diaryRepo'

export default function DatePickerDialog({
  value,
  highlightDays,
  onConfirm,
  onCancel,
}: {
  value: string
  /** 要标「这天有内容」的日期；不传就按日记 + 随记去查（健康页传自己的摄入日期） */
  highlightDays?: Set<string>
  onConfirm: (dateKey: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(value.slice(5, 7)))
  const [selected, setSelected] = useState(value)
  const [headEditing, setHeadEditing] = useState(false)
  const [draftYear, setDraftYear] = useState('')
  const [draftMonth, setDraftMonth] = useState('')
  /** 自己查出来的「有内容」日期；调用方传了 highlightDays 就直接用那份 */
  const [fetchedDays, setFetchedDays] = useState<Set<string>>(new Set())
  const writtenDays = highlightDays ?? fetchedDays

  // 一次性把「哪些天有内容」捞出来：日历只是个小面板，不需要实时订阅
  useEffect(() => {
    if (highlightDays) return
    let alive = true
    void Promise.all([everyEntry(), everyStamp()]).then(([entries, stamps]) => {
      if (!alive) return
      const days = new Set<string>()
      for (const item of [...entries, ...stamps]) {
        if (!item.deletedAt) days.add(item.dateKey)
      }
      setFetchedDays(days)
    })
    return () => {
      alive = false
    }
  }, [highlightDays])

  function shiftMonth(delta: number) {
    const next = viewMonth + delta
    if (next < 1) {
      setViewYear(viewYear - 1)
      setViewMonth(12)
    } else if (next > 12) {
      setViewYear(viewYear + 1)
      setViewMonth(1)
    } else {
      setViewMonth(next)
    }
  }

  function startHeadEdit() {
    setDraftYear(String(viewYear))
    setDraftMonth(String(viewMonth))
    setHeadEditing(true)
  }

  function applyHeadEdit() {
    const year = Number(draftYear)
    const month = Number(draftMonth)
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) setViewYear(Math.trunc(year))
    if (Number.isFinite(month) && month >= 1 && month <= 12) setViewMonth(Math.trunc(month))
    setHeadEditing(false)
  }

  /** 光标在"年/月"两个输入框之间移动时不要提交，移出整组才提交 */
  function handleHeadBlur(event: ReactFocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    applyHeadEdit()
  }

  function goToday() {
    const key = todayKey()
    setViewYear(Number(key.slice(0, 4)))
    setViewMonth(Number(key.slice(5, 7)))
    setSelected(key)
  }

  const { firstWeekday, daysInMonth } = monthGrid(viewYear, viewMonth)
  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  const weekLabels = t('datePicker.weekdays').split(',')

  return (
    <Modal size="xs" label={t('datePicker.title')} onClose={onCancel}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label={t('datePicker.prev')}
          className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-fg"
        >
          ‹
        </button>

        {headEditing ? (
          <div className="flex items-center gap-1" onBlur={handleHeadBlur}>
            <input
              type="number"
              autoFocus
              value={draftYear}
              onChange={(event) => setDraftYear(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyHeadEdit()
              }}
              className={`${INPUT_NARROW} w-20 text-center`}
            />
            <span className="text-sm text-muted">{t('datePicker.year')}</span>
            <input
              type="number"
              value={draftMonth}
              onChange={(event) => setDraftMonth(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyHeadEdit()
              }}
              className={`${INPUT_NARROW} w-14 text-center`}
            />
            <span className="text-sm text-muted">{t('datePicker.month')}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startHeadEdit}
            title={t('datePicker.headEditHint')}
            className="rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:text-brand"
          >
            {t('datePicker.head', { year: viewYear, month: viewMonth })}
          </button>
        )}

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label={t('datePicker.next')}
          className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-fg"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {weekLabels.map((label) => (
          <span key={label} className="py-1 text-xs text-muted">
            {label}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />
          const dateKey = toDateKey(new Date(viewYear, viewMonth - 1, day))
          const isSelected = dateKey === selected
          const hasContent = writtenDays.has(dateKey)
          const isToday = dateKey === todayKey()
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setSelected(dateKey)}
              title={hasContent ? t('datePicker.hasContent') : undefined}
              className={[
                'rounded-lg py-1 text-sm transition-colors',
                isSelected
                  ? 'bg-brand font-medium text-on-brand'
                  : hasContent
                    ? 'bg-brand/15 text-fg hover:bg-brand/25'
                    : 'text-fg hover:bg-surface-2',
                // 今天加 2px 描边；已经选中时品牌色底够醒目，不再叠框
                // 有内容的日子底色已经是 brand/15，描边换深一级的 brand/70 拉开对比
                isToday && !isSelected
                  ? hasContent
                    ? 'border-2 border-brand/70'
                    : 'border-2 border-brand'
                  : '',
              ].join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand/25" />
          {t('datePicker.hasContent')}
        </span>
        <span className="flex items-center gap-1">
          <i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border-2 border-brand" />
          {t('datePicker.todayMark')}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goToday}
          className={GHOST_BUTTON}
        >
          {t('datePicker.today')}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={GHOST_BUTTON}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
