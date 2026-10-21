import { useState } from 'react'
import type { FocusEvent as ReactFocusEvent } from 'react'
import { monthGrid, toDateKey, todayKey } from '@/core/utils/dateKey'
import Modal from '@/shared/ui/Modal'
import { INPUT_NARROW } from '@/shared/ui/inputStyles'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export default function DatePickerDialog({
  value,
  onConfirm,
  onCancel,
}: {
  value: string
  onConfirm: (dateKey: string) => void
  onCancel: () => void
}) {
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(value.slice(5, 7)))
  const [selected, setSelected] = useState(value)
  const [headEditing, setHeadEditing] = useState(false)
  const [draftYear, setDraftYear] = useState('')
  const [draftMonth, setDraftMonth] = useState('')

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

  return (
    <Modal size="xs" onClose={onCancel}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
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
            <span className="text-sm text-muted">年</span>
            <input
              type="number"
              value={draftMonth}
              onChange={(event) => setDraftMonth(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyHeadEdit()
              }}
              className={`${INPUT_NARROW} w-14 text-center`}
            />
            <span className="text-sm text-muted">月</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startHeadEdit}
            title="点击可手动填写年月"
            className="rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:text-brand"
          >
            {viewYear} 年 {viewMonth} 月
          </button>
        )}

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
          className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-fg"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEK_LABELS.map((label) => (
          <span key={label} className="py-1 text-xs text-muted">
            {label}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />
          const dateKey = toDateKey(new Date(viewYear, viewMonth - 1, day))
          const isSelected = dateKey === selected
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setSelected(dateKey)}
              className={[
                'rounded-lg py-1 text-sm transition-colors',
                isSelected ? 'bg-brand font-medium text-on-brand' : 'text-fg hover:bg-surface-2',
              ].join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goToday}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          回到今日
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </Modal>
  )
}
