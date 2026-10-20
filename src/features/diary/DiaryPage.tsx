import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from '../../core/db/live'
import type { DiaryEntry } from '../../core/db/schema'
import { useToast } from '../../app/providers/ToastProvider'
import BatchBar from '../../shared/ui/BatchBar'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Tab from '../../shared/ui/Tab'
import { BAR_BUTTON, BAR_DANGER, SOLID_BUTTON } from '../../shared/ui/buttonStyles'
import {
  addStamp,
  createEntry,
  entriesOfDay,
  moveEntries,
  moveStamps,
  removeEntries,
  removeEntry,
  removeStamps,
  restoreEntries,
  restoreEntry,
  restoreStamps,
  stampsOfDay,
  updateContent,
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
import AiComposeDialog from '../ai/AiComposeDialog'
import { isConfigured, loadAiConfig } from '../ai/aiConfig'
import { buildExport, downloadExport } from './diaryExport'
import type { ExportFormat } from './diaryExport'

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
  /** AI 整理成日记的弹窗 */
  const [composeOpen, setComposeOpen] = useState(false)

  const entries = useLiveQuery(() => entriesOfDay(dateKey), [dateKey])
  const stamps = useLiveQuery(() => stampsOfDay(dateKey), [dateKey])

  const unit = mode === 'diary' ? '条' : '笔'
  const noun = mode === 'diary' ? '日记' : '随记'
  const selectedCount = selected.length
  /** 当前栏目里能选中的全部 id：日记看日记，随记看随记 */
  const selectableIds =
    mode === 'diary'
      ? (entries ?? []).map((entry) => entry.id)
      : (stamps ?? []).map((stamp) => stamp.id)

  function exitSelect() {
    setSelectMode(false)
    setSelected([])
  }

  /** 换栏目时顺手退出批量，免得选中的是上一栏的 id */
  function switchMode(next: 'diary' | 'stamp') {
    if (next === mode) return
    exitSelect()
    setMode(next)
  }

  function toggleSelect(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
  }

  function selectAll() {
    setSelected(selectableIds)
  }

  function invertSelect() {
    setSelected(selectableIds.filter((id) => !selected.includes(id)))
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

  /** 点「AI 整理成日记」：没配模型就先领到设置页去，别让人白等一场失败 */
  function handleCompose() {
    setHint('')
    if (!isConfigured(loadAiConfig())) {
      setHint('还没配 AI 模型：去「设置 → AI 模型」选一家、把 key 填上，回来就能用了。')
      return
    }
    setComposeOpen(true)
  }

  /** 草稿确认：新建一条当天的日记，随记原文不动 */
  async function handleComposeConfirm(content: string) {
    setComposeOpen(false)
    const entry = await createEntry(dateKey)
    await updateContent(entry.id, content)
    showToast({
      message: '已写成一条日记放回这天，随记还都在',
      actionLabel: '打开',
      onAction: () => navigate(`/diary/${entry.code}`, { state: { editable: true } }),
    })
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
    if (mode === 'diary') await removeEntries(ids)
    else await removeStamps(ids)
    setSelected([])
    showToast({
      message: `已删除 ${ids.length} ${unit}${noun}`,
      actionLabel: '撤销',
      onAction: () => {
        void (mode === 'diary' ? restoreEntries(ids) : restoreStamps(ids))
      },
    })
  }

  async function handleMove(next: string) {
    const ids = selected
    setMoveOpen(false)
    if (mode === 'diary') await moveEntries(ids, next)
    else await moveStamps(ids, next)
    setSelected([])
    showToast({ message: `已把 ${ids.length} ${unit}${noun}移到 ${formatDateCn(next)}` })
  }

  function handleExport(format: ExportFormat) {
    setExportOpen(false)
    const pickedEntries = mode === 'diary' ? (entries ?? []).filter((e) => selected.includes(e.id)) : []
    const pickedStamps = mode === 'stamp' ? (stamps ?? []).filter((s) => selected.includes(s.id)) : []
    const file = buildExport(pickedEntries, pickedStamps, format)
    downloadExport(file)
    setSelected([])
    showToast({
      message: `已导出 ${pickedEntries.length + pickedStamps.length} ${unit}${noun}（${file.label}）`,
    })
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
          <Tab active={mode === 'diary'} onClick={() => switchMode('diary')}>
            日记
          </Tab>
          <Tab active={mode === 'stamp'} onClick={() => switchMode('stamp')}>
            随记
          </Tab>
        </div>
      </div>

      {/* 左：内容动作；右：回收站（两端对齐）；批量多选时收起动作，只留工具条 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!selectMode && (
            <>
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
                </>
              ) : (
                <>
                  <button type="button" onClick={handleAddStamp} className={SOLID_BUTTON}>
                    ＋ 记一笔
                  </button>
                  {/* 这天一笔都没记时不亮，免得点了生成一篇空日记 */}
                  <button
                    type="button"
                    onClick={handleCompose}
                    disabled={stamps === undefined || stamps.length === 0}
                    className={`${SOLID_BUTTON} disabled:opacity-40`}
                  >
                    ✨ AI 整理成日记
                  </button>
                </>
              )}
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
          )}
        </div>

        <Link to="/diary/trash" state={{ mode }} className={SOLID_BUTTON}>
          回收站
        </Link>
      </div>

      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}

      {mode === 'stamp' && (
        <StampTimeline
          dateKey={dateKey}
          focusId={focusStampId}
          stamps={stamps}
          selectMode={selectMode}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      )}

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
        <BatchBar count={selectedCount} unit={unit}>
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
        </BatchBar>
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
          title={`删除选中的 ${selectedCount} ${unit}${noun}？`}
          description="删除后可以在回收站对应的栏目里找回来，也能用底部提示条撤销。"
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

      {composeOpen && (
        <AiComposeDialog
          dateKey={dateKey}
          stamps={stamps ?? []}
          onConfirm={(content) => void handleComposeConfirm(content)}
          onCancel={() => setComposeOpen(false)}
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
