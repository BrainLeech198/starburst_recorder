import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import type { DiaryEntry } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Modal from '@/shared/ui/Modal'
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
import ImageImportDialog from './ImageImportDialog'
import type { ImportSummary } from './importPages'
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
  /** 图片导入：先开空弹窗，选图、排页序、开始识别都在弹窗里进行 */
  const [importOpen, setImportOpen] = useState(false)
  const [importConfig, setImportConfig] = useState<AiConfig | null>(null)
  /** 模型没配好时拦住点按的原因；非 null 就弹出「去配置」窗口 */
  const [configHint, setConfigHint] = useState<string | null>(null)
  /** 一批图里认出多个日期时，先停下来让用户挑一天 */
  const [dateChoice, setDateChoice] = useState<ImportSummary | null>(null)

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
   * 模型没配好时拦住点按：只显示一行小字几乎注意不到（模拟器里就像「点不开」），
   * 所以原因收进 configHint，弹出带「去配置」的窗口。没过就返回 null。
   */
  function checkVisionConfig(): AiConfig | null {
    const config = loadAiConfig()
    if (config.model.trim() === '') {
      setConfigHint(t('diary.hintNoModelName'))
      return null
    }
    if (!isConfigured(config)) {
      setConfigHint(t('diary.hintIncomplete'))
      return null
    }
    if (config.vision === 'no') {
      setConfigHint(t('diary.hintNoVision'))
      return null
    }
    return config
  }

  /**
   * 点「图片导入」：先把模型这边的话说清楚，再开导入弹窗。
   * 不直接拉系统文件选择器——很多人下意识只选一张，选完页面就换了；
   * 真正的选图交给弹窗里的「继续添加」，可以一张一张补。
   */
  function handleImageImport() {
    setHint('')
    const config = checkVisionConfig()
    if (!config) return
    setImportConfig(config)
    setImportOpen(true)
  }

  /** 选好日期后统一进草稿：列表的 ?date= 先跟着换，返回时才停在正确那天 */
  async function finishImport(summary: ImportSummary, targetDate: string) {
    setDateChoice(null)
    if (targetDate !== dateKey) await navigate(`/diary?date=${targetDate}`, { replace: true })
    navigate('/diary/new', {
      state: {
        dateKey: targetDate,
        content: summary.content,
        weather: summary.weather || undefined,
      },
    })
  }

  /**
   * 识别完成：只开一份内存草稿，不写库。
   * 整批只认出一个日期（或续页没写日期）就直接用那天；
   * 认出多个日期时不替用户猜，弹出来让他挑一天。
   */
  async function handleImportDone(summary: ImportSummary) {
    setImportOpen(false)
    if (summary.dateKeys.length > 1) {
      setDateChoice(summary)
      return
    }
    await finishImport(summary, summary.dateKeys[0] ?? dateKey)
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

      {importOpen && importConfig && (
        <ImageImportDialog
          config={importConfig}
          onDone={(summary) => void handleImportDone(summary)}
          onCancel={() => setImportOpen(false)}
        />
      )}

      {configHint !== null && (
        <ConfirmDialog
          title={t('diary.configNeededTitle')}
          description={configHint}
          confirmLabel={t('diary.goConfig')}
          tone="brand"
          onConfirm={() => {
            setConfigHint(null)
            void navigate('/me/agent/ai')
          }}
          onCancel={() => setConfigHint(null)}
        />
      )}

      {dateChoice && (
        <Modal size="xs" label={t('importDate.title')} onClose={() => setDateChoice(null)}>
          <div className="text-sm font-medium">{t('importDate.title')}</div>
          <p className="mt-2 text-xs text-muted">
            {t('importDate.body', { count: dateChoice.dateKeys.length })}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {dateChoice.dateKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void finishImport(dateChoice, key)}
                className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2"
              >
                {formatDateCn(key)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDateChoice(null)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
            >
              {t('common.cancel')}
            </button>
          </div>
        </Modal>
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
