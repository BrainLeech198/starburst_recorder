import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryEntry } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Tab from '@/shared/ui/Tab'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { BAR_BUTTON, BAR_DANGER, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import {
  addStamp,
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
} from './diaryRepo'
import {
  formatClock,
  formatDateCn,
  formatMonthDayCn,
  isDateKey,
  relativeDayLabel,
  todayKey,
  weekdayLabel,
} from '@/core/utils/dateKey'
import DatePickerDialog from './DatePickerDialog'
import StampTimeline from './StampTimeline'
import ExportDialog from './ExportDialog'
import AiComposeDialog from '@/features/ai/AiComposeDialog'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import type { AiConfig } from '@/features/ai/aiConfig'
import type { Transcript } from '@/features/ai/aiVision'
import ImageImportDialog from './ImageImportDialog'
import { buildExport } from './diaryExport'
import type { ExportFormat } from './diaryExport'
import { describeSave, saveTextFile } from '@/platform/saveFile'

/** 纸条上的正文部分，普通模式和批量模式共用 */
function SlipBody({ entry }: { entry: DiaryEntry }) {
  const { t } = useI18n()
  return (
    <>
      <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
      <div className="font-hand mt-1 line-clamp-3 text-sm">
        {entry.content.trim() || <span className="text-ink-muted">{t('diary.emptyContent')}</span>}
      </div>
    </>
  )
}

export default function DiaryPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useI18n()
  // 列表停在哪天写进 URL：从编辑页返回、换天、图片导入都能带着这一天回来
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const dateKey = isDateKey(dateParam) ? dateParam : todayKey()
  /** 换天：改 ?date=，不要另开一条历史 */
  function setDateKey(next: string) {
    setSearchParams({ date: next }, { replace: true })
  }
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
  const isToday = dateKey === todayKey()

  const unit = mode === 'diary' ? t('diary.unitDiary') : t('diary.unitStamp')
  /** 「3 条日记」「2 笔随记」：数量与量词一起由文案决定，方便以后换语言 */
  const targetOf = (count: number) =>
    t(mode === 'diary' ? 'diary.targetDiary' : 'diary.targetStamp', { count })
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

  /** 新增：只开一份内存草稿，进编辑页点了保存才落盘 */
  function handleCreate() {
    setHint('')
    navigate('/diary/new', { state: { dateKey } })
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
      setHint(t('diary.hintNoModel'))
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
      setHint(t('diary.hintNoModelName'))
      return
    }
    if (!isConfigured(config)) {
      setHint(t('diary.hintIncomplete'))
      return
    }
    if (config.vision === 'no') {
      setHint(t('diary.hintNoVision'))
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

  /**
   * 识别成功：先开一份内存草稿，不写库。
   * 照片上的日期若不是列表当前停的那天，把列表 URL 也换到那天——返回时直接停在那一天，
   * 不会出现「导入了 15 号，回来还停在 22 号，以为没存上」。
   */
  async function handleImportDone(transcript: Transcript) {
    setImportFile(null)
    const targetDate = isDateKey(transcript.dateKey) ? transcript.dateKey : dateKey
    // 先把列表那一天改掉，再进编辑页：等这次 replace 落地，浏览器返回才会回到正确的日期
    if (targetDate !== dateKey) await navigate(`/diary?date=${targetDate}`, { replace: true })
    navigate('/diary/new', {
      state: {
        dateKey: targetDate,
        content: transcript.content,
        weather: transcript.weather || undefined,
      },
    })
  }

  /** AI 整理：整理出来的正文也先进草稿，等用户自己决定存到哪一天 */
  function handleComposeConfirm(content: string) {
    setComposeOpen(false)
    navigate('/diary/new', { state: { dateKey, content } })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const targetId = pendingDelete.id
    setPendingDelete(null)
    await removeEntry(targetId)
    showToast({
      message: t('diary.deletedOne'),
      actionLabel: t('diary.undo'),
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
      message: t('diary.batchDeleted', { target: targetOf(ids.length) }),
      actionLabel: t('diary.undo'),
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
    showToast({
      message: t('diary.moved', {
        target: targetOf(ids.length),
        date: formatDateCn(next),
      }),
    })
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
        t('diary.exportDetail', {
          target: targetOf(pickedEntries.length + pickedStamps.length),
          label: file.label,
        }),
        t,
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
          className="font-hand flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
        >
          {/* 今天绿、其他日期黄：一眼知道列表停在哪一段 */}
          <span
            className={[
              'rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
              isToday ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            ].join(' ')}
          >
            {relativeDayLabel(dateKey)}
          </span>
          <span className="text-sm">{formatDateCn(dateKey)}</span>
          <span className="text-xs text-muted">{weekdayLabel(dateKey)}</span>
        </button>

        <div className="flex items-center">
          <Tab active={mode === 'diary'} onClick={() => switchMode('diary')}>
            {t('diary.tabDiary')}
          </Tab>
          <Tab active={mode === 'stamp'} onClick={() => switchMode('stamp')}>
            {t('diary.tabStamp')}
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
                    {t('diary.new')}
                  </button>
                  <button type="button" onClick={handleImageImport} className={SOLID_BUTTON}>
                    {t('diary.imageImport')}
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
                    {t('diary.addStamp')}
                  </button>
                  {/* 这天一笔都没记时不亮，免得点了生成一篇空日记 */}
                  <button
                    type="button"
                    onClick={handleCompose}
                    disabled={stamps === undefined || stamps.length === 0}
                    className={`${SOLID_BUTTON} disabled:opacity-40`}
                  >
                    {t('diary.compose')}
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
                {t('diary.batch')}
              </button>
            </>
          )}
        </div>

        <Link to="/diary/trash" state={{ mode }} className={SOLID_BUTTON}>
          {t('diary.trash')}
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
        <p className="mt-6 text-center text-sm text-muted">{t('diary.reading')}</p>
      )}

      {mode === 'diary' && entries !== undefined && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">{t('diary.noEntries')}</p>
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
                    title={t('diary.deleteHint')}
                    className="absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-ink-muted opacity-70 transition-colors hover:text-danger hover:opacity-100"
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">{t('diary.delete')}</span>
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
            {t('diary.delete')}
          </button>
          <button
            type="button"
            onClick={() => setMoveOpen(true)}
            disabled={selectedCount === 0}
            className={BAR_BUTTON}
          >
            {t('diary.moveDate')}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={selectedCount === 0}
            className={BAR_BUTTON}
          >
            {t('diary.export')}
          </button>
        </BatchActions>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('diary.deleteThisTitle')}
          description={t('diary.deleteThisBody')}
          confirmLabel={t('diary.delete')}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {batchDeleteOpen && (
        <ConfirmDialog
          title={t('diary.batchDeleteTitle', { target: targetOf(selectedCount) })}
          description={t('diary.batchDeleteBody')}
          confirmLabel={t('diary.delete')}
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
          target={targetOf(selectedCount)}
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
