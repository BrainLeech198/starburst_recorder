import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DiaryEntry } from '../../core/db/schema'
import { useToast } from '../../app/providers/ToastProvider'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { createEntry, entriesOfDay, removeEntry, restoreEntry } from './diaryRepo'
import { formatDateCn, formatStamp, todayKey, weekdayLabel } from '../../core/utils/dateKey'
import DatePickerDialog from './DatePickerDialog'

const BUTTON =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg transition-colors hover:border-brand'

export default function DiaryPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [dateKey, setDateKey] = useState(todayKey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DiaryEntry | null>(null)
  const [hint, setHint] = useState('')

  const entries = useLiveQuery(() => entriesOfDay(dateKey), [dateKey])

  async function handleCreate() {
    setHint('')
    const entry = await createEntry(dateKey)
    navigate(`/diary/${entry.code}`, { state: { editable: true } })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const targetId = pendingDelete.id
    setPendingDelete(null)
    await removeEntry(targetId)
    showToast({
      message: '已删除这条日记',
      actionLabel: '撤销',
      onAction: () => {
        void restoreEntry(targetId)
      },
    })
  }

  return (
    <div className="w-full p-4">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => {
            setHint('')
            setPickerOpen(true)
          }}
          className={BUTTON}
        >
          日期选择
        </button>
        <button type="button" onClick={handleCreate} className={BUTTON}>
          新增日记
        </button>
        <button
          type="button"
          onClick={() => setHint('图片导入还没接入，会等 AI 接通后一起做。')}
          className={BUTTON}
        >
          图片导入
        </button>
      </div>

      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}

      <div className="-mx-4 mt-4 border-y border-line px-4 py-2 text-center text-sm">
        当前日期: {formatDateCn(dateKey)} {weekdayLabel(dateKey)}
      </div>

      {entries === undefined && <p className="mt-6 text-center text-sm text-muted">读取中…</p>}

      {entries !== undefined && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">这天还没有日记</p>
      )}

      {entries !== undefined && entries.length > 0 && (
        <ul className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-lg border border-line px-4 py-3"
            >
              <Link to={`/diary/${entry.code}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted">
                  <span>{entry.code}</span>
                  <span>创建 {formatStamp(entry.createdAt)}</span>
                  <span>编辑 {formatStamp(entry.updatedAt)}</span>
                </div>
                <div className="mt-1 line-clamp-3 text-sm text-fg">
                  {entry.content.trim() || '（还没有内容）'}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setPendingDelete(entry)}
                className="shrink-0 rounded-lg border border-danger px-2 py-1 text-xs text-danger transition-colors"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="确定删除这条日记？"
          description="删除后可以在回收站里找回来。"
          confirmLabel="删除"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dateKey}
          onConfirm={(next) => {
            setDateKey(next)
            setPickerOpen(false)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
