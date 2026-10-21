import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from '../../core/db/live'
import type { DiaryEntry } from '../../core/db/schema'
import { useToast } from '../../app/providers/ToastProvider'
import BatchActions from '../../shared/ui/BatchActions'
import { useBatchSelect } from '../../shared/ui/useBatchSelect'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Tab from '../../shared/ui/Tab'
import ToolbarRow from '../../shared/ui/ToolbarRow'
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
import type { AiConfig } from '../ai/aiConfig'
import ImageImportDialog from './ImageImportDialog'
import { buildExport } from './diaryExport'
import type { ExportFormat } from './diaryExport'
import { describeSave, saveTextFile } from '../../core/saveFile'

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
  const batch = useBatchSelect()
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  /** AI 整理成日记的弹窗 */
  const [composeOpen, setComposeOpen] = useState(false)
  /** 图片导入：选好的照片和当时读到的配置 */
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importConfig, setImportConfig] = useState<AiConfig | null>(null)

  const entries = useLiveQuery(() => entriesOfDay(dateKey), [dateKey])
  const stamps = useLiveQuery(() => stampsOfDay(dateKey), [dateKey])

  const unit = mode === 'diary' ? '条' : '笔'
  const noun = mode === 'diary' ? '日记' : '随记'
  const selectedCount = batch.count
  /** 当前栏目里能选中的全部 id：日记看日记，随记看随记 */
  const selectableIds =
    mode === 'diary'
      ? (entries ?? []).map((entry) => entry.id)
      : (stamps ?? []).map((stamp) => stamp.id)

  /** 换栏目时顺手退出批量，免得选中的是上一栏的 id */
  function switchMode(next: 'diary' | 'stamp') {
    if (next === mode) return
    batch.exit()
    setMode(next)
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

  /**
   * 点「图片导入」：先把模型这边的话说清楚，再让人选图。
   * 没填模型、模型不支持看图都当场拦下来，别让人等一场必失败的识别。
   */
  function handleImageImport() {
    setHint('')
    const config = loadAiConfig()
    if (config.model.trim() === '') {
      setHint('还没填模型名，识别不了手写。去「设置 → AI 模型」把模型和 key 填好，再回来点「图片导入」。')
      return
    }
    if (!isConfigured(config)) {
      setHint('AI 还没配全，识别不了手写。去「设置 → AI 模型」把服务地址、模型名和 key 补齐。')
      return
    }
    if (config.vision === 'no') {
      setHint(
        '现在这个模型看不了图片。去「设置 → AI 模型」换一个能看图的模型（比如 qwen-vl-plus、gpt-4o-mini），或者点一次「测试连接」让它帮你判断。',
      )
      return
    }
    setImportConfig(config)
    imageInputRef.current?.click()
  }

  /** 选完照片：先关掉系统选择器留下的状态，再交给识别弹窗 */
  function handleImagePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) setImportFile(file)
  }

  /** 识别成功：新建一条当天的日记，带着正文直接进编辑页，让人自己再改 */
  async function handleImportDone(content: string) {
    setImportFile(null)
    const entry = await createEntry(dateKey)
    await updateContent(entry.id, content)
    navigate(`/diary/${entry.code}`, { state: { editable: true } })
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
    const ids = batch.selected
    setBatchDeleteOpen(false)
    if (mode === 'diary') await removeEntries(ids)
    else await removeStamps(ids)
    batch.clear()
    showToast({
      message: `已删除 ${ids.length} ${unit}${noun}`,
      actionLabel: '撤销',
      onAction: () => {
        void (mode === 'diary' ? restoreEntries(ids) : restoreStamps(ids))
      },
    })
  }

  async function handleMove(next: string) {
    const ids = batch.selected
    setMoveOpen(false)
    if (mode === 'diary') await moveEntries(ids, next)
    else await moveStamps(ids, next)
    batch.clear()
    showToast({ message: `已把 ${ids.length} ${unit}${noun}移到 ${formatDateCn(next)}` })
  }

  async function handleExport(format: ExportFormat) {
    setExportOpen(false)
    const pickedEntries =
      mode === 'diary' ? (entries ?? []).filter((e) => batch.isSelected(e.id)) : []
    const pickedStamps =
      mode === 'stamp' ? (stamps ?? []).filter((s) => batch.isSelected(s.id)) : []
    const file = buildExport(pickedEntries, pickedStamps, format)
    batch.clear()
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(
        outcome,
        `${pickedEntries.length + pickedStamps.length} ${unit}${noun}（${file.label}）`,
      ),
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

      {/* 左：内容动作；右：回收站（两端对齐）；批量多选时收起动作，只留工具条。
          整行都是按钮，套一层底色跟下面的内容分开 */}
      <ToolbarRow className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!batch.active && (
            <>
              {mode === 'diary' ? (
                <>
                  <button type="button" onClick={handleCreate} className={SOLID_BUTTON}>
                    ＋ 新增
                  </button>
                  <button type="button" onClick={handleImageImport} className={SOLID_BUTTON}>
                    图片导入
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    className="hidden"
                  />
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
                  batch.enter()
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
      </ToolbarRow>

      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}

      {mode === 'stamp' && (
        <StampTimeline
          dateKey={dateKey}
          focusId={focusStampId}
          stamps={stamps}
          selectMode={batch.active}
          selected={batch.selected}
          onToggleSelect={batch.toggle}
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
            const isSelected = batch.isSelected(entry.id)
            return (
              <li
                key={entry.id}
                className={isSelected ? 'paper-slip paper-slip-selected' : 'paper-slip'}
              >
                {batch.active ? (
                  <button
                    type="button"
                    onClick={() => batch.toggle(entry.id)}
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

                {batch.active ? (
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

      {batch.active && (
        <BatchActions select={batch} ids={selectableIds} unit={unit}>
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
        </BatchActions>
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

      {importFile && importConfig && (
        <ImageImportDialog
          file={importFile}
          config={importConfig}
          onDone={(content) => void handleImportDone(content)}
          onCancel={() => setImportFile(null)}
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
