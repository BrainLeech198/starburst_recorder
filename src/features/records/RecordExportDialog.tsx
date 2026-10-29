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
 * 免得四组一起堆成一条长滚动；时间范围、格式各占一行，底部操作栏吸在面板下沿。
 */
import { useMemo, useState } from 'react'
import type { BackupPayload } from '@/features/diary/diaryBackup'
import type { ExportFormat } from '@/features/diary/diaryExport'
import { formatMonthDay, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { describeSave, saveTextFile } from '@/platform/saveFile'
import {
  RECORD_KINDS,
  buildRecordExport,
  filterByDate,
  recordsOf,
  selectionSize,
  toggleSelection,
} from './recordExport'
import type { RecordItem, RecordKind, RecordSelection } from './recordExport'

type Window = '7d' | '30d' | 'all'

const WINDOWS: { id: Window; key: MessageKey }[] = [
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
  weight: 'records.kindWeight',
  finance: 'records.kindFinance',
}

const CHIP = 'px-2 py-0.5 text-[11px]'

/** 列表从新到旧排：想找的通常是最近几条；真正导出的文件仍然按时间正序 */
function newestFirst(a: RecordItem, b: RecordItem): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1
  if (a.time !== b.time) return a.time < b.time ? 1 : -1
  return b.createdAt - a.createdAt
}

export default function RecordExportDialog({
  data,
  initial,
  onClose,
}: {
  /** 整库数据：四类记录都从这儿取 */
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
    weight: [...(initial?.weight ?? [])],
    finance: [...(initial?.finance ?? [])],
  }))
  // 列表页带着预选进来时，预选可能不在最近 7 天里，直接铺开全部
  const [window, setWindow] = useState<Window>(selectionSize(selection) > 0 ? 'all' : '7d')
  const [format, setFormat] = useState<ExportFormat>('markdown')
  // 打开就落在「有预选 / 有记录」的那一类，省得先看一个空列表
  const [active, setActive] = useState<RecordKind>(() => {
    const picked = RECORD_KINDS.find((kind) => (initial?.[kind]?.length ?? 0) > 0)
    if (picked) return picked
    return RECORD_KINDS.find((kind) => recordsOf(data, kind).length > 0) ?? 'diary'
  })

  const from =
    window === '7d' ? shiftDay(todayKey(), -6) : window === '30d' ? shiftDay(todayKey(), -29) : '0000-00-00'

  const groups = useMemo(() => {
    return RECORD_KINDS.map((kind) => {
      const all = recordsOf(data, kind)
      const picked = new Set(selection[kind])
      const inWindow = filterByDate(all, from, '9999-12-31')
      const shownIds = new Set(inWindow.map((item) => item.id))
      // 已勾上但落在筛选范围外的记录也继续显示，不然用户看不到自己选了什么
      const extra = all.filter((item) => picked.has(item.id) && !shownIds.has(item.id))
      return {
        kind,
        total: all.length,
        pickedCount: selection[kind].length,
        visible: [...inWindow, ...extra].sort(newestFirst),
      }
    })
  }, [data, selection, from])

  const current = groups.find((group) => group.kind === active) ?? groups[0]
  const activeFormat = FORMATS.find((option) => option.id === format) ?? FORMATS[0]
  const count = selectionSize(selection)
  const blocked = count === 0

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
    <Modal size="lg" label={t('records.title')} onClose={onClose}>
      <div className="text-sm font-medium">{t('records.title')}</div>
      <p className="mt-1 text-xs text-muted">{t('records.desc')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted">{t('records.window')}</span>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={window === item.id}
              onClick={() => setWindow(item.id)}
              className={`${choiceTile(window === item.id)} ${CHIP}`}
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
        {groups.map((group) => {
          const isActive = group.kind === active
          return (
            <button
              key={group.kind}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActive(group.kind)}
              className={`flex shrink-0 items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-muted hover:border-brand/60 hover:text-fg'
              }`}
            >
              <span>{t(KIND_LABEL[group.kind])}</span>
              <span
                className={`text-[10px] tabular-nums ${
                  group.pickedCount > 0
                    ? 'font-medium text-brand'
                    : isActive
                      ? 'text-brand/70'
                      : 'text-muted'
                }`}
              >
                {group.pickedCount}/{group.total}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex h-7 items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {t('records.picked', { count: current.pickedCount })}
        </span>
        {current.visible.length > 0 && (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => selectVisible(current.kind, current.visible)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
            >
              {t('records.selectAllVisible')}
            </button>
            <button
              type="button"
              disabled={current.pickedCount === 0}
              onClick={() => clearKind(current.kind)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-danger disabled:opacity-40"
            >
              {t('records.clearKind')}
            </button>
          </div>
        )}
      </div>

      {current.visible.length === 0 ? (
        <p className="m-0 mt-1 rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
          {current.total === 0 ? t('records.emptyKind') : t('records.emptyWindow')}
        </p>
      ) : (
        <div className="mt-1 space-y-1">
          {current.visible.map((item) => {
            const checked = selection[current.kind].includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`${t(KIND_LABEL[current.kind])} ${formatMonthDay(item.dateKey, t)} ${item.text}`}
                onClick={() =>
                  setSelection((previous) =>
                    toggleSelection(previous, current.kind, item.id),
                  )
                }
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
                    <span className="tabular-nums">{formatMonthDay(item.dateKey, t)}</span>
                    <span className="font-mono tabular-nums">{item.time}</span>
                    {item.code !== '' && (
                      <span className="font-mono text-[10px] opacity-70">{item.code}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-sm break-words text-fg">
                    {item.text || t('records.previewEmpty')}
                  </span>
                  {item.detail !== '' && (
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">
                      {item.detail}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
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

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-line bg-surface px-4 py-3">
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
            {t('records.export')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
