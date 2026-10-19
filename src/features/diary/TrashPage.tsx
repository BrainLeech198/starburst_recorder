import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useToast } from '../../app/providers/ToastProvider'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Tab from '../../shared/ui/Tab'
import { SOLID_BUTTON, SOLID_DANGER } from '../../shared/ui/buttonStyles'
import {
  purgeEntry,
  purgeStamp,
  purgeTrashedEntries,
  purgeTrashedStamps,
  restoreEntry,
  restoreStamp,
  trashedEntries,
  trashedStamps,
} from './diaryRepo'
import { formatMonthDayCn, formatStamp } from '../../core/utils/dateKey'

/** 纸条上的小文字按钮 */
const SLIP_BUTTON = 'rounded-lg px-2 py-1 text-xs transition-colors'

type Mode = 'diary' | 'stamp'
type Pending = { kind: 'entry' | 'stamp' | 'clear'; id?: string }

export default function TrashPage() {
  const { showToast } = useToast()
  const location = useLocation()
  const [pending, setPending] = useState<Pending | null>(null)

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

  async function handleRestore(kind: 'entry' | 'stamp', id: string) {
    if (kind === 'entry') await restoreEntry(id)
    else await restoreStamp(id)
    showToast({ message: '已恢复，回到它原来的日期去了' })
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
      <div className="flex items-center justify-between gap-2">
        <Link to="/diary" className={SOLID_BUTTON}>
          ← 返回日记
        </Link>
        <button
          type="button"
          onClick={() => setPending({ kind: 'clear' })}
          disabled={isEmpty}
          className={`${SOLID_DANGER} disabled:opacity-40`}
        >
          清空{noun}回收站
        </button>
      </div>

      <div className="mt-3 flex items-center">
        <Tab active={mode === 'diary'} onClick={() => setMode('diary')}>
          日记
        </Tab>
        <Tab active={mode === 'stamp'} onClick={() => setMode('stamp')}>
          随记
        </Tab>
      </div>

      <p className="mt-2 text-xs text-muted">
        {loading
          ? '读取中…'
          : `这里放着你删掉的${noun}，共 ${count} ${unit}。恢复会送它们回到原来的日期；彻底删除和清空就真没了。`}
      </p>

      {isEmpty && <p className="mt-6 text-center text-sm text-muted">没有删掉的{noun}</p>}

      {!loading && mode === 'diary' && entries.length > 0 && (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="paper-slip">
              <div className="font-hand text-sm">{formatMonthDayCn(entry.dateKey)}</div>
              <div className="font-hand mt-1 line-clamp-2 text-sm">
                {entry.content.trim() || <span className="text-ink-muted">还没有写内容</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-muted opacity-70">
                  {entry.code} · 删除于 {formatStamp(entry.deletedAt ?? 0)}
                </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && mode === 'stamp' && stamps.length > 0 && (
        <ul className="mt-4 space-y-3">
          {stamps.map((stamp) => (
            <li key={stamp.id} className="paper-slip">
              <div className="font-hand text-sm">
                {formatMonthDayCn(stamp.dateKey)} {stamp.time}
              </div>
              <div className="font-hand mt-1 line-clamp-2 text-sm">
                {stamp.content.trim() || <span className="text-ink-muted">没写内容</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-muted opacity-70">
                  删除于 {formatStamp(stamp.deletedAt ?? 0)}
                </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'clear' ? `清空${noun}回收站？` : '彻底删除？'}
          description={
            pending.kind === 'clear'
              ? `回收站里的${noun}会被永久删除，无法恢复。不影响另一边的回收站。`
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
