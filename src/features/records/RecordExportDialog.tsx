/**
 * 挑选记录导出：日记、随记、健康摄入、收支逐条勾选，打一份可读文件。
 *
 * 和「导出数据…」的分工：
 *   - 那边是整库备份（JSON、可分三大块、能导入恢复）；
 *   - 这边只认勾了几条，给 AI 或别人看，顺手能选 Markdown / 纯文本 / JSON。
 *
 * 两处入口共用这一个弹窗：数据页从整库取数、空勾选打开；
 * 健康页把当前勾中的摄入带进来，省得再找一遍。
 *
 * 版面按「一次只看一类」来做：四类记录做成带计数的标签，列表只铺当前这一类，
 * 免得四组一起堆成一条长滚动；时间范围、格式各占一行。
 *
 * 版面结构（2026-11-03 改）：面板是 flex 列，头部（标题 / 范围 / 分类 / 全选）与
 * 底部（格式 / 导出）都不滚，只有中间列表滚。原来底部是 `sticky bottom-0`，
 * 在安卓 WebView 里滚动时会出现「列表文字从操作栏底下透出来」的残影，而且
 * 长列表整段渲染，几千条时点一次复选框要卡一下。现在：
 *   1. 每类记录只算一次（data 不变就不重算），点复选框只重算当前这一类；
 *   2. 勾选状态用 Set 查，不再每行 includes 一遍（原来是 O(n²)）；
 *   3. 列表按 PAGE 条一批渲染，滚到底自动续，行组件 memo，只重画变了的那几行。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackupPayload } from '@/features/diary/diaryBackup'
import type { ExportFormat } from '@/features/diary/diaryExport'
import { formatMonthDay, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { describeSave, saveTextFile } from '@/platform/saveFile'
import {
  RECORD_KINDS,
  buildRecordExport,
  recordsOf,
  selectionSize,
  toggleSelection,
  visibleItems,
} from './recordExport'
import type { RecordItem, RecordKind, RecordSelection } from './recordExport'

type Range = '7d' | '30d' | 'all'

/** 一次铺多少行；滚到底再续一批。行高约 80px，40 行差不多是两屏半。 */
const PAGE = 40

const RANGES: { id: Range; key: MessageKey }[] = [
  { id: '7d', key: 'records.window7' },
  { id: '30d', key: 'records.window30' },
  { id: 'all', key: 'records.windowAll' },
]

const FORMATS: { id: ExportFormat; label?: string; labelKey?: MessageKey; hintKey: MessageKey }[] = [
  { id: 'markdown', label: 'Markdown', hintKey: 'records.markdownHint' },
  { id: 'text', labelKey: 'export.textLabel', hintKey: 'records.textHint' },
  { id: 'json', label: 'JSON', hintKey: 'records.jsonHint' },
]

const KIND_LABEL: Record<RecordKind, MessageKey> = {
  diary: 'records.kindDiary',
  stamp: 'records.kindStamp',
  intake: 'records.kindIntake',
  sleep: 'records.kindSleep',
  training: 'records.kindTraining',
  weight: 'records.kindWeight',
  finance: 'records.kindFinance',
  food: 'records.kindFood',
}

const CHIP = 'px-2 py-0.5 text-[11px]'

/**
 * 一行记录。memo 起来：勾选只影响被点的那一行，别的行不该跟着重画。
 * 回调与文案都由外面传稳定的值，所以这里只会在 checked 变化时重渲染。
 */
const Row = memo(function Row({
  item,
  checked,
  kindLabel,
  emptyText,
  onToggle,
}: {
  item: RecordItem
  checked: boolean
  kindLabel: string
  emptyText: string
  onToggle: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${kindLabel} ${
        item.dateKey !== '' ? `${formatMonthDay(item.dateKey, t)} ` : ''
      }${item.text}`}
      onClick={() => onToggle(item.id)}
      className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
        checked ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/60'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
          checked ? 'border-brand bg-brand text-on-brand' : 'border-muted'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted">
          {/* 食物库没有日期，只露短编号 */}
          {item.dateKey !== '' && (
            <>
              <span className="tabular-nums">{formatMonthDay(item.dateKey, t)}</span>
              <span className="font-mono tabular-nums">{item.time}</span>
            </>
          )}
          {item.code !== '' && (
            <span className="font-mono text-[10px] opacity-70">{item.code}</span>
          )}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-sm break-words text-fg">
          {item.text || emptyText}
        </span>
        {item.detail !== '' && (
          <span className="mt-0.5 block font-mono text-[11px] text-muted">{item.detail}</span>
        )}
      </span>
    </button>
  )
})

export default function RecordExportDialog({
  data,
  initial,
  onClose,
}: {
  /** 整库数据：各类记录都从这儿取 */
  data: BackupPayload
  /** 列表页带进来的预选，例如健康页勾中的几笔摄入 */
  initial?: Partial<Record<RecordKind, string[]>>
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [selection, setSelection] = useState<RecordSelection>(() => ({
    diary: [...(initial?.diary ?? [])],
    stamp: [...(initial?.stamp ?? [])],
    intake: [...(initial?.intake ?? [])],
    sleep: [...(initial?.sleep ?? [])],
    training: [...(initial?.training ?? [])],
    weight: [...(initial?.weight ?? [])],
    finance: [...(initial?.finance ?? [])],
    food: [...(initial?.food ?? [])],
  }))
  // 列表页带着预选进来时，预选可能不在最近 7 天里，直接铺开全部
  const [range, setRange] = useState<Range>(selectionSize(selection) > 0 ? 'all' : '7d')
  const [format, setFormat] = useState<ExportFormat>('markdown')
  // 打开就落在「有预选 / 有记录」的那一类，省得先看一个空列表
  const [active, setActive] = useState<RecordKind>(() => {
    const picked = RECORD_KINDS.find((kind) => (initial?.[kind]?.length ?? 0) > 0)
    if (picked) return picked
    return RECORD_KINDS.find((kind) => recordsOf(data, kind).length > 0) ?? 'diary'
  })

  const from =
    range === '7d' ? shiftDay(todayKey(), -6) : range === '30d' ? shiftDay(todayKey(), -29) : '0000-00-00'

  // 当前这一类已经铺了多少行。用「键 + 条数」存着而不是靠 effect 复位：
  // 换分类或换时间范围时键对不上，自然回到第一批，也不用在 effect 里 setState。
  const pageKey = `${active}|${from}`
  const [paging, setPaging] = useState<{ key: string; limit: number }>({ key: pageKey, limit: PAGE })
  const limit = paging.key === pageKey ? paging.limit : PAGE
  const grow = useCallback(() => {
    setPaging((previous) => ({
      key: pageKey,
      limit: (previous.key === pageKey ? previous.limit : PAGE) + PAGE,
    }))
  }, [pageKey])

  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLButtonElement>(null)

  // 八类记录各摊一次：只有整库数据换了才重算。原来这份活挂在 selection 上，
  // 点一下复选框就把八类全部重排一遍，记录一多就卡。
  const baseByKind = useMemo(() => {
    const map = {} as Record<RecordKind, RecordItem[]>
    for (const kind of RECORD_KINDS) map[kind] = recordsOf(data, kind)
    return map
  }, [data])

  // 勾选状态换成 Set：原来每行都要 selection[kind].includes(id)，行数是 n 就是 O(n²)
  const pickedSets = useMemo(() => {
    const map = {} as Record<RecordKind, Set<string>>
    for (const kind of RECORD_KINDS) map[kind] = new Set(selection[kind])
    return map
  }, [selection])

  // 只算当前这一类要铺的行
  const visible = useMemo(
    () => visibleItems(baseByKind[active], from, pickedSets[active]),
    [baseByKind, active, from, pickedSets],
  )

  const activeFormat = FORMATS.find((option) => option.id === format) ?? FORMATS[0]
  const count = selectionSize(selection)
  const blocked = count === 0
  const shown = visible.slice(0, limit)
  const rest = visible.length - shown.length

  // 滚到底自动续一批；按钮也留着，读屏和键盘用户点得着
  useEffect(() => {
    if (rest <= 0) return
    const root = listRef.current
    const target = sentinelRef.current
    if (!root || !target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) grow()
      },
      { root, rootMargin: '240px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [rest, limit, grow])

  const toggleRow = useCallback(
    (id: string) => {
      setSelection((previous) => toggleSelection(previous, active, id))
    },
    [active],
  )

  function selectVisible(kind: RecordKind, items: RecordItem[]) {
    setSelection((previous) => {
      const next = { ...previous }
      next[kind] = [...new Set([...previous[kind], ...items.map((item) => item.id)])]
      return next
    })
  }

  function clearKind(kind: RecordKind) {
    setSelection((previous) => ({ ...previous, [kind]: [] }))
  }

  async function handleExport() {
    if (blocked) return
    const file = buildRecordExport(data, selection, format)
    const outcome = await saveTextFile(file)
    onClose()
    showToast({
      message: describeSave(outcome, t('records.exported', { count, label: file.label }), t),
    })
  }

  return (
    <Modal size="lg" label={t('records.title')} onClose={onClose} panelClassName="flex flex-col">
      {/* 头部固定：筛选条件不跟着列表滚走 */}
      <div className="shrink-0">
        <div className="text-sm font-medium">{t('records.title')}</div>
        <p className="mt-1 text-xs text-muted">{t('records.desc')}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-[11px] text-muted">{t('records.window')}</span>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={range === item.id}
                onClick={() => setRange(item.id)}
                className={`${choiceTile(range === item.id)} ${CHIP}`}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
        </div>

        <div
          className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label={t('records.title')}
        >
          {RECORD_KINDS.map((kind) => {
            const isActive = kind === active
            const pickedCount = selection[kind].length
            const total = baseByKind[kind].length
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActive(kind)}
                className={`flex shrink-0 items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  isActive
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-line text-muted hover:border-brand/60 hover:text-fg'
                }`}
              >
                <span>{t(KIND_LABEL[kind])}</span>
                <span
                  className={`text-[10px] tabular-nums ${
                    pickedCount > 0
                      ? 'font-medium text-brand'
                      : isActive
                        ? 'text-brand/70'
                        : 'text-muted'
                  }`}
                >
                  {pickedCount}/{total}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex h-7 items-center justify-between gap-2">
          <span className="text-[11px] text-muted">
            {t('records.picked', { count: selection[active].length })}
          </span>
          {visible.length > 0 && (
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => selectVisible(active, visible)}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
              >
                {t('records.selectAllVisible')}
              </button>
              <button
                type="button"
                disabled={selection[active].length === 0}
                onClick={() => clearKind(active)}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-danger disabled:opacity-40"
              >
                {t('records.clearKind')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 只有列表滚：面板本身不滚，底部操作栏就不会被内容顶出来 */}
      <div
        ref={listRef}
        className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain"
      >
        {visible.length === 0 ? (
          <p className="m-0 rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
            {baseByKind[active].length === 0 ? t('records.emptyKind') : t('records.emptyWindow')}
          </p>
        ) : (
          <>
            {shown.map((item) => (
              <Row
                key={item.id}
                item={item}
                checked={pickedSets[active].has(item.id)}
                kindLabel={t(KIND_LABEL[active])}
                emptyText={t('records.previewEmpty')}
                onToggle={toggleRow}
              />
            ))}
            {rest > 0 && (
              <button
                ref={sentinelRef}
                type="button"
                onClick={grow}
                className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-center text-[11px] text-muted transition-colors hover:border-brand/60 hover:text-brand"
              >
                {t('records.loadMore', { count: rest })}
              </button>
            )}
          </>
        )}
      </div>

      {/* 底部固定：格式 + 导出，不再 sticky */}
      <div className="mt-3 shrink-0 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-muted">{t('records.format')}</span>
          <div className="flex flex-1 gap-1.5">
            {FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={format === option.id}
                onClick={() => setFormat(option.id)}
                className={`flex-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                  format === option.id
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-line text-muted hover:border-brand/60 hover:text-fg'
                }`}
              >
                {option.labelKey ? t(option.labelKey) : option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{t(activeFormat.hintKey)}</p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{t('records.selected', { count })}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => void handleExport()}
              className={`${OUTLINE_BUTTON} disabled:opacity-40`}
            >
              <Icon name="export" />
              {t('records.export')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
