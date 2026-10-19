import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DiaryEntry } from '../../core/db/schema'
import { useToast } from '../../app/providers/ToastProvider'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Tab from '../../shared/ui/Tab'
import { SOLID_BUTTON } from '../../shared/ui/buttonStyles'
import {
  addStamp,
  createEntry,
  entriesOfDay,
  moveEntries,
  removeEntries,
  removeEntry,
  restoreEntries,
  restoreEntry,
} from './diaryRepo'
import {
  formatClock,
  formatDateCn,
  formatMonthDayCn,
  todayKey,
  weekdayLabel,
} from '../../core/utils/dateKey'
import DatePickerDialog from './DatePickerDialog'
import StampTimeline from './StampTimeline'
import ExportDialog from './ExportDialog'
import { buildExport, downloadExport } from './diaryExport'
import type { ExportFormat } from './diaryExport'

/** 底部批量工具条上的小按钮 */
const BAR_BUTTON =
  'rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40'
const BAR_DANGER =
  'rounded-lg px-2.5 py-1 text-xs text-danger transition-colors hover:opacity-80 disabled:opacity-40'

/** 纸条上的正文部分，普通模式和批量模式共用 */
function SlipBody({ entry }: { entry: DiaryEntry }) {
  return (
    <>
      <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
      <div className="font-hand mt-1 line-clamp-3 text-sm">
        {entry.content.trim() || <span className="text-ink-muted">还没有写内容</span>}
      </div>
    </>
  )
}

export default function DiaryPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [dateKey, setDateKey] = useState(todayKey)
  const [mode, setMode] = useState<'diary' | 'stamp'>('diary')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DiaryEntry | null>(null)
  const [hint, setHint] = useState('')
  /** 刚记下的那一笔，用来把光标直接落到它的内容框 */
  const [focusStampId, setFocusStampId] = useState('')

  // 批量多选
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const entries = useLiveQuery(() => entriesOfDay(dateKey), [dateKey])

  const unit = mode === 'diary' ? '条' : '笔'
  const selectedCount = selected.length

  function exitSelect() {
    setSelectMode(false)
    setSelected([])
  }

  function toggleSelect(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
  }

  function selectAll() {
    if (!entries) return
    setSelected(entries.map((entry) => entry.id))
  }

  function invertSelect() {
    if (!entries) return
    const all = entries.map((entry) => entry.id)
    setSelected(all.filter((id) => !selected.includes(id)))
  }

  async function handleCreate() {
    setHint('')
    const entry = await createEntry(dateKey)
    navigate(`/diary/${entry.code}`, { state: { editable: true } })
  }

  async function handleAddStamp() {
    setHint('')
    const stamp = await addStamp(dateKey)
    setFocusStampId(stamp.id)
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

  async function handleBatchDelete() {
    const ids = selected
    setBatchDeleteOpen(false)
    await removeEntries(ids)
    setSelected([])
    showToast({
      message: `已删除 ${ids.length} 条日记`,
      actionLabel: '撤销',
      onAction: () => {
        void restoreEntries(ids)
      },
    })
  }

  async function handleMove(next: string) {
    const ids = selected
    setMoveOpen(false)
    await moveEntries(ids, next)
    setSelected([])
    showToast({ message: `已把 ${ids.length} 条日记移到 ${formatDateCn(next)}` })
  }

  function handleExport(format: ExportFormat) {
    setExportOpen(false)
    if (!entries) return
    const picked = entries.filter((entry) => selected.includes(entry.id))
    const file = buildExport(picked, [], format)
    downloadExport(file)
    setSelected([])
    showToast({ message: `已导出 ${picked.length} 条日记（${file.label}）` })
  }

  return (
    <div className="w-full p-4">
      <div className="flex items-center justify-between gap-2">
        {/* 日期本身就是日期选择入口 */}
        <button
          type="button"
          onClick={() => {
            setHint('')
            setPickerOpen(true)
          }}
          className="font-hand flex items-baseline gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
        >
          <span className="text-sm">{formatDateCn(dateKey)}</span>
          <span className="text-xs text-muted">{weekdayLabel(dateKey)}</span>
        </button>

        <div className="flex items-center">
          <Tab active={mode === 'diary'} onClick={() => setMode('diary')}>
            日记
          </Tab>
          <Tab active={mode === 'stamp'} onClick={() => setMode('stamp')}>
            随记
          </Tab>
        </div>
      </div>

      {/* 左：内容动作；右：回收站（两端对齐） */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {mode === 'diary' ? (
            <>
              <button type="button" onClick={handleCreate} className={SOLID_BUTTON}>
                ＋ 新增
              </button>
              <button
                type="button"
                onClick={() => setHint('图片导入还没接入，会等 AI 接通后一起做。')}
                className={SOLID_BUTTON}
              >
                图片导入
              </button>
              <button
                type="button"
                onClick={() => {
                  setHint('')
                  setSelectMode(true)
                }}
                className={SOLID_BUTTON}
              >
                批量
              </button>
            </>
          ) : (
            <button type="button" onClick={handleAddStamp} className={SOLID_BUTTON}>
              ＋ 记一笔
            </button>
          )}
        </div>

        <Link to="/diary/trash" state={{ mode }} className={SOLID_BUTTON}>
          回收站
        </Link>
      </div>

      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}

      {mode === 'stamp' && <StampTimeline dateKey={dateKey} focusId={focusStampId} />}

      {mode === 'diary' && entries === undefined && (
        <p className="mt-6 text-center text-sm text-muted">读取中…</p>
      )}

      {mode === 'diary' && entries !== undefined && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">这天还没有日记</p>
      )}

      {mode === 'diary' && entries !== undefined && entries.length > 0 && (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => {
            const isSelected = selected.includes(entry.id)
            return (
              <li
                key={entry.id}
                className={isSelected ? 'paper-slip paper-slip-selected' : 'paper-slip'}
              >
                {selectMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(entry.id)}
                    className="block w-full pr-8 text-left"
                  >
                    <SlipBody entry={entry} />
                  </button>
                ) : (
                  <Link to={`/diary/${entry.code}`} className="block pr-8">
                    <SlipBody entry={entry} />
                  </Link>
                )}

                <div className="mt-2 text-right font-mono text-xs text-ink-muted opacity-70">
                  {entry.code} · {formatClock(entry.createdAt)}
                </div>

                {selectMode ? (
                  <span
                    aria-hidden="true"
                    className={
                      isSelected
                        ? 'absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-on-brand'
                        : 'absolute top-2 right-2 h-6 w-6 rounded-full border border-ink-muted opacity-60'
                    }
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(entry)}
                    title="删除这条日记"
                    className="absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-ink-muted opacity-70 transition-colors hover:text-danger hover:opacity-100"
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">删除</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {selectMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="px-2 text-sm text-fg">
              已选 {selectedCount} {unit}
            </span>
            <button type="button" onClick={selectAll} className={BAR_BUTTON}>
              全选
            </button>
            <button type="button" onClick={invertSelect} className={BAR_BUTTON}>
              反选
            </button>
            <button type="button" onClick={() => setSelected([])} className={BAR_BUTTON}>
              取消
            </button>
            <button
              type="button"
              onClick={() => setBatchDeleteOpen(true)}
              disabled={selectedCount === 0}
              className={BAR_DANGER}
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              disabled={selectedCount === 0}
              className={BAR_BUTTON}
            >
              移动日期
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={selectedCount === 0}
              className={BAR_BUTTON}
            >
              导出
            </button>
            <button type="button" onClick={exitSelect} className={`${BAR_BUTTON} text-brand`}>
              完成
            </button>
          </div>
        </div>
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

      {batchDeleteOpen && (
        <ConfirmDialog
          title={`删除选中的 ${selectedCount} 条日记？`}
          description="删除后可以在回收站里找回来，也能用底部提示条撤销。"
          confirmLabel="删除"
          onConfirm={handleBatchDelete}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}

      {moveOpen && (
        <DatePickerDialog
          value={dateKey}
          onConfirm={(next) => void handleMove(next)}
          onCancel={() => setMoveOpen(false)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          count={selectedCount}
          unit={unit}
          onPick={handleExport}
          onCancel={() => setExportOpen(false)}
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
