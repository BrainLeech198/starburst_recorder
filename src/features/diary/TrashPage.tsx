import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useLiveQuery } from '../../core/db/live'
import { useToast } from '../../app/providers/ToastProvider'
import BatchBar from '../../shared/ui/BatchBar'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Tab from '../../shared/ui/Tab'
import ToolbarRow from '../../shared/ui/ToolbarRow'
import {
  BACK_BUTTON,
  BAR_BUTTON,
  BAR_DANGER,
  SOLID_BUTTON,
  SOLID_DANGER,
} from '../../shared/ui/buttonStyles'
import {
  purgeEntries,
  purgeEntry,
  purgeStamp,
  purgeStamps,
  purgeTrashedEntries,
  purgeTrashedStamps,
  restoreEntries,
  restoreEntry,
  restoreStamp,
  restoreStamps,
  trashedEntries,
  trashedStamps,
} from './diaryRepo'
import { formatMonthDayCn, formatStamp } from '../../core/utils/dateKey'

/** 纸条上的小文字按钮 */
const SLIP_BUTTON = 'rounded-lg px-2 py-1 text-xs transition-colors'

type Mode = 'diary' | 'stamp'
type Pending = { kind: 'entry' | 'stamp' | 'clear' | 'batch'; id?: string }

export default function TrashPage() {
  const { showToast } = useToast()
  const location = useLocation()
  const [pending, setPending] = useState<Pending | null>(null)

  // 批量多选：日记栏和随记栏共用一份选中集，换栏目时清掉
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  // 从日记页哪个栏目进来的，就默认落在哪个回收站
  const cameFrom = (location.state as { mode?: Mode } | null)?.mode
  const [mode, setMode] = useState<Mode>(cameFrom === 'stamp' ? 'stamp' : 'diary')

  const entries = useLiveQuery(() => trashedEntries(), [])
  const stamps = useLiveQuery(() => trashedStamps(), [])

  const noun = mode === 'diary' ? '日记' : '随记'
  const unit = mode === 'diary' ? '条' : '笔'
  const loading = entries === undefined || stamps === undefined
  const count = mode === 'diary' ? (entries?.length ?? 0) : (stamps?.length ?? 0)
  const isEmpty = !loading && count === 0
  const selectedCount = selected.length
  const selectableIds =
    mode === 'diary' ? (entries ?? []).map((e) => e.id) : (stamps ?? []).map((s) => s.id)

  function exitSelect() {
    setSelectMode(false)
    setSelected([])
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    exitSelect()
    setMode(next)
  }

  function toggleSelect(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))
  }

  async function handleRestore(kind: 'entry' | 'stamp', id: string) {
    if (kind === 'entry') await restoreEntry(id)
    else await restoreStamp(id)
    showToast({ message: '已恢复，回到它原来的日期去了' })
  }

  /** 批量恢复：一次性送回原来的日期；如果这一栏被清空了就顺手退出批量 */
  async function handleBatchRestore() {
    const ids = selected
    if (mode === 'diary') await restoreEntries(ids)
    else await restoreStamps(ids)
    setSelected([])
    if (ids.length >= count) setSelectMode(false)
    showToast({ message: `已恢复 ${ids.length} ${unit}${noun}` })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)

    if (target.kind === 'clear') {
      if (mode === 'diary') await purgeTrashedEntries()
      else await purgeTrashedStamps()
      showToast({ message: `${noun}回收站已清空` })
      return
    }
    if (target.kind === 'batch') {
      const ids = selected
      if (mode === 'diary') await purgeEntries(ids)
      else await purgeStamps(ids)
      setSelected([])
      if (ids.length >= count) setSelectMode(false)
      showToast({ message: `已彻底删除 ${ids.length} ${unit}${noun}` })
      return
    }
    if (target.kind === 'entry' && target.id) {
      await purgeEntry(target.id)
      showToast({ message: '这条日记已彻底删除' })
      return
    }
    if (target.kind === 'stamp' && target.id) {
      await purgeStamp(target.id)
      showToast({ message: '这一笔随记已彻底删除' })
    }
  }

  return (
    <div className="w-full p-4">
      {/* 顶上一整行都是功能按钮，套一层底色跟下面的清单分开 */}
      <ToolbarRow>
        <Link to="/diary" className={BACK_BUTTON}>
          ← 返回日记
        </Link>
        <div className="flex items-center gap-2">
          {!selectMode && !isEmpty && (
            <button type="button" onClick={() => setSelectMode(true)} className={SOLID_BUTTON}>
              批量
            </button>
          )}
          <button
            type="button"
            onClick={() => setPending({ kind: 'clear' })}
            disabled={isEmpty || selectMode}
            className={`${SOLID_DANGER} disabled:opacity-40`}
          >
            清空{noun}回收站
          </button>
        </div>
      </ToolbarRow>

      <div className="mt-3 flex items-center">
        <Tab active={mode === 'diary'} onClick={() => switchMode('diary')}>
          日记
        </Tab>
        <Tab active={mode === 'stamp'} onClick={() => switchMode('stamp')}>
          随记
        </Tab>
      </div>

      <p className="mt-2 text-xs text-muted">
        {loading
          ? '读取中…'
          : selectMode
            ? `点纸条选中它，或者用底部工具条全选。`
            : `这里放着你删掉的${noun}，共 ${count} ${unit}。恢复会送它们回到原来的日期；彻底删除和清空就真没了。`}
      </p>

      {isEmpty && <p className="mt-6 text-center text-sm text-muted">没有删掉的{noun}</p>}

      {!loading && mode === 'diary' && entries.length > 0 && (
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
                    <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {entry.content.trim() || <span className="text-ink-muted">还没有写内容</span>}
                    </div>
                  </button>
                ) : (
                  <>
                    <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {entry.content.trim() || <span className="text-ink-muted">还没有写内容</span>}
                    </div>
                  </>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-muted opacity-70">
                    {entry.code} · 删除于 {formatStamp(entry.deletedAt ?? 0)}
                  </span>
                  {!selectMode && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleRestore('entry', entry.id)}
                        className={`${SLIP_BUTTON} text-ink-muted hover:text-ink`}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'entry', id: entry.id })}
                        className={`${SLIP_BUTTON} text-danger`}
                      >
                        彻底删除
                      </button>
                    </span>
                  )}
                </div>

                {selectMode && (
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
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!loading && mode === 'stamp' && stamps.length > 0 && (
        <ul className="mt-4 space-y-3">
          {stamps.map((stamp) => {
            const isSelected = selected.includes(stamp.id)
            return (
              <li
                key={stamp.id}
                className={isSelected ? 'paper-slip paper-slip-selected' : 'paper-slip'}
              >
                {selectMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(stamp.id)}
                    className="block w-full pr-8 text-left"
                  >
                    <div className="font-hand text-sm">
                      {formatMonthDayCn(stamp.dateKey)} {stamp.time}
                    </div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {stamp.content.trim() || <span className="text-ink-muted">没写内容</span>}
                    </div>
                  </button>
                ) : (
                  <>
                    <div className="font-hand text-sm">
                      {formatMonthDayCn(stamp.dateKey)} {stamp.time}
                    </div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {stamp.content.trim() || <span className="text-ink-muted">没写内容</span>}
                    </div>
                  </>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-muted opacity-70">
                    删除于 {formatStamp(stamp.deletedAt ?? 0)}
                  </span>
                  {!selectMode && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleRestore('stamp', stamp.id)}
                        className={`${SLIP_BUTTON} text-ink-muted hover:text-ink`}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'stamp', id: stamp.id })}
                        className={`${SLIP_BUTTON} text-danger`}
                      >
                        彻底删除
                      </button>
                    </span>
                  )}
                </div>

                {selectMode && (
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
                )}
              </li>
            )
          })}
        </ul>
      )}

      {selectMode && (
        <BatchBar count={selectedCount} unit={unit}>
          <button type="button" onClick={() => setSelected(selectableIds)} className={BAR_BUTTON}>
            全选
          </button>
          <button
            type="button"
            onClick={() => setSelected(selectableIds.filter((id) => !selected.includes(id)))}
            className={BAR_BUTTON}
          >
            反选
          </button>
          <button type="button" onClick={() => setSelected([])} className={BAR_BUTTON}>
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleBatchRestore()}
            disabled={selectedCount === 0}
            className={BAR_BUTTON}
          >
            恢复
          </button>
          <button
            type="button"
            onClick={() => setPending({ kind: 'batch' })}
            disabled={selectedCount === 0}
            className={BAR_DANGER}
          >
            彻底删除
          </button>
          <button type="button" onClick={exitSelect} className={`${BAR_BUTTON} text-brand`}>
            完成
          </button>
        </BatchBar>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'clear'
              ? `清空${noun}回收站？`
              : pending.kind === 'batch'
                ? `彻底删除选中的 ${selectedCount} ${unit}${noun}？`
                : '彻底删除？'
          }
          description={
            pending.kind === 'clear'
              ? `回收站里的${noun}会被永久删除，无法恢复。不影响另一边的回收站。`
              : pending.kind === 'batch'
                ? '这些内容会被永久删除，无法恢复，也没有撤销。'
                : '这一项会被永久删除，无法恢复。'
          }
          confirmLabel={pending.kind === 'clear' ? '清空' : '彻底删除'}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
