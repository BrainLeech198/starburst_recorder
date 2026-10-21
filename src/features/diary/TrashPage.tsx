import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import BatchActions from '@/shared/ui/BatchActions'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Tab from '@/shared/ui/Tab'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import {
  BACK_BUTTON,
  BAR_BUTTON,
  BAR_DANGER,
  SOLID_BUTTON,
  SOLID_DANGER,
} from '@/shared/ui/buttonStyles'
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
import { formatMonthDayCn, formatStamp } from '@/core/utils/dateKey'

/** 纸条上的小文字按钮 */
const SLIP_BUTTON = 'rounded-lg px-2 py-1 text-xs transition-colors'

type Mode = 'diary' | 'stamp'
type Pending = { kind: 'entry' | 'stamp' | 'clear' | 'batch'; id?: string }

export default function TrashPage() {
  const { showToast } = useToast()
  const { t } = useI18n()
  const location = useLocation()
  const [pending, setPending] = useState<Pending | null>(null)

  // 批量多选：日记栏和随记栏共用一份选中集，换栏目时清掉
  const batch = useBatchSelect()

  // 从日记页哪个栏目进来的，就默认落在哪个回收站
  const cameFrom = (location.state as { mode?: Mode } | null)?.mode
  const [mode, setMode] = useState<Mode>(cameFrom === 'stamp' ? 'stamp' : 'diary')

  const entries = useLiveQuery(() => trashedEntries(), [])
  const stamps = useLiveQuery(() => trashedStamps(), [])

  const isDiary = mode === 'diary'
  const unit = isDiary ? t('diary.unitDiary') : t('diary.unitStamp')
  /** 「3 条日记」「2 笔随记」：数量与量词一起由文案决定，方便以后换语言 */
  const targetOf = (selected: number) =>
    t(isDiary ? 'diary.targetDiary' : 'diary.targetStamp', { count: selected })
  const loading = entries === undefined || stamps === undefined
  const count = mode === 'diary' ? (entries?.length ?? 0) : (stamps?.length ?? 0)
  const isEmpty = !loading && count === 0
  const selectedCount = batch.count
  const selectableIds =
    mode === 'diary' ? (entries ?? []).map((e) => e.id) : (stamps ?? []).map((s) => s.id)

  function switchMode(next: Mode) {
    if (next === mode) return
    batch.exit()
    setMode(next)
  }

  async function handleRestore(kind: 'entry' | 'stamp', id: string) {
    if (kind === 'entry') await restoreEntry(id)
    else await restoreStamp(id)
    showToast({ message: t('trash.restored') })
  }

  /** 批量恢复：一次性送回原来的日期；如果这一栏被清空了就顺手退出批量 */
  async function handleBatchRestore() {
    const ids = batch.selected
    if (mode === 'diary') await restoreEntries(ids)
    else await restoreStamps(ids)
    batch.clear()
    if (ids.length >= count) batch.exit()
    showToast({ message: t('trash.restoredCount', { target: targetOf(ids.length) }) })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)

    if (target.kind === 'clear') {
      if (mode === 'diary') await purgeTrashedEntries()
      else await purgeTrashedStamps()
      showToast({ message: isDiary ? t('trash.clearedDiary') : t('trash.clearedStamp') })
      return
    }
    if (target.kind === 'batch') {
      const ids = batch.selected
      if (mode === 'diary') await purgeEntries(ids)
      else await purgeStamps(ids)
      batch.clear()
      if (ids.length >= count) batch.exit()
      showToast({ message: t('trash.purgedCount', { target: targetOf(ids.length) }) })
      return
    }
    if (target.kind === 'entry' && target.id) {
      await purgeEntry(target.id)
      showToast({ message: t('trash.purgedEntry') })
      return
    }
    if (target.kind === 'stamp' && target.id) {
      await purgeStamp(target.id)
      showToast({ message: t('trash.purgedStamp') })
    }
  }

  return (
    <div className="w-full p-4">
      {/* 顶上一整行都是功能按钮，套一层底色跟下面的清单分开 */}
      <ToolbarRow>
        <Link to="/diary" className={BACK_BUTTON}>
          {t('trash.back')}
        </Link>
        <div className="flex items-center gap-2">
          {!batch.active && !isEmpty && (
            <button type="button" onClick={batch.enter} className={SOLID_BUTTON}>
              {t('trash.batch')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPending({ kind: 'clear' })}
            disabled={isEmpty || batch.active}
            className={`${SOLID_DANGER} disabled:opacity-40`}
          >
            {isDiary ? t('trash.clearDiary') : t('trash.clearStamp')}
          </button>
        </div>
      </ToolbarRow>

      <div className="mt-3 flex items-center">
        <Tab active={mode === 'diary'} onClick={() => switchMode('diary')}>
          {t('diary.tabDiary')}
        </Tab>
        <Tab active={mode === 'stamp'} onClick={() => switchMode('stamp')}>
          {t('diary.tabStamp')}
        </Tab>
      </div>

      <p className="mt-2 text-xs text-muted">
        {loading
          ? t('common.reading')
          : batch.active
            ? t('trash.batchHint')
            : t(isDiary ? 'trash.hintDiary' : 'trash.hintStamp', { count })}
      </p>

      {isEmpty && (
        <p className="mt-6 text-center text-sm text-muted">
          {isDiary ? t('trash.emptyDiary') : t('trash.emptyStamp')}
        </p>
      )}

      {!loading && mode === 'diary' && entries.length > 0 && (
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
                    <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {entry.content.trim() || (
                        <span className="text-ink-muted">{t('diary.emptyContent')}</span>
                      )}
                    </div>
                  </button>
                ) : (
                  <>
                    <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {entry.content.trim() || (
                        <span className="text-ink-muted">{t('diary.emptyContent')}</span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-muted opacity-70">
                    {t('trash.codeDeletedAt', {
                      code: entry.code,
                      at: formatStamp(entry.deletedAt ?? 0),
                    })}
                  </span>
                  {!batch.active && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleRestore('entry', entry.id)}
                        className={`${SLIP_BUTTON} text-ink-muted hover:text-ink`}
                      >
                        {t('trash.restore')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'entry', id: entry.id })}
                        className={`${SLIP_BUTTON} text-danger`}
                      >
                        {t('trash.purge')}
                      </button>
                    </span>
                  )}
                </div>

                {batch.active && (
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
            const isSelected = batch.isSelected(stamp.id)
            return (
              <li
                key={stamp.id}
                className={isSelected ? 'paper-slip paper-slip-selected' : 'paper-slip'}
              >
                {batch.active ? (
                  <button
                    type="button"
                    onClick={() => batch.toggle(stamp.id)}
                    className="block w-full pr-8 text-left"
                  >
                    <div className="font-hand text-sm">
                      {formatMonthDayCn(stamp.dateKey)} {stamp.time}
                    </div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {stamp.content.trim() || (
                        <span className="text-ink-muted">{t('trash.noContent')}</span>
                      )}
                    </div>
                  </button>
                ) : (
                  <>
                    <div className="font-hand text-sm">
                      {formatMonthDayCn(stamp.dateKey)} {stamp.time}
                    </div>
                    <div className="font-hand mt-1 line-clamp-2 text-sm">
                      {stamp.content.trim() || (
                        <span className="text-ink-muted">{t('trash.noContent')}</span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-muted opacity-70">
                    {t('trash.deletedAt', { at: formatStamp(stamp.deletedAt ?? 0) })}
                  </span>
                  {!batch.active && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleRestore('stamp', stamp.id)}
                        className={`${SLIP_BUTTON} text-ink-muted hover:text-ink`}
                      >
                        {t('trash.restore')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'stamp', id: stamp.id })}
                        className={`${SLIP_BUTTON} text-danger`}
                      >
                        {t('trash.purge')}
                      </button>
                    </span>
                  )}
                </div>

                {batch.active && (
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

      {batch.active && (
        <BatchActions select={batch} ids={selectableIds} unit={unit}>
          <button
            type="button"
            onClick={() => void handleBatchRestore()}
            disabled={selectedCount === 0}
            className={BAR_BUTTON}
          >
            {t('trash.restore')}
          </button>
          <button
            type="button"
            onClick={() => setPending({ kind: 'batch' })}
            disabled={selectedCount === 0}
            className={BAR_DANGER}
          >
            {t('trash.purge')}
          </button>
        </BatchActions>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'clear'
              ? isDiary
                ? t('trash.clearDiaryTitle')
                : t('trash.clearStampTitle')
              : pending.kind === 'batch'
                ? t('trash.purgeSelectedTitle', { target: targetOf(selectedCount) })
                : t('trash.purgeOneTitle')
          }
          description={
            pending.kind === 'clear'
              ? isDiary
                ? t('trash.clearDiaryBody')
                : t('trash.clearStampBody')
              : pending.kind === 'batch'
                ? t('trash.purgeSelectedBody')
                : t('trash.purgeOneBody')
          }
          confirmLabel={pending.kind === 'clear' ? t('trash.clearConfirm') : t('trash.purge')}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
