/**
 * 导入备份时发现冲突 → 让用户一条条决定留哪边。
 *
 * 默认全选「本地」：导入是个加分操作，默认不应该拿走用户手里已有的东西。
 * 想覆盖的人一键「全部用备份」，不用一条条点。
 */
import { useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { conflictKey } from './diaryMerge'
import type { ConflictKind, MergeConflict } from './diaryMerge'

const KIND_LABEL: Record<ConflictKind, MessageKey> = {
  entry: 'data.conflictKindEntry',
  stamp: 'data.conflictKindStamp',
  day: 'data.conflictKindDay',
}

export default function ConflictDialog({
  conflicts,
  onCancel,
  onDone,
}: {
  conflicts: MergeConflict[]
  onCancel: () => void
  /** 交回「保留本地」的那些项，其余按备份的版本导入 */
  onDone: (keepLocal: Set<string>) => void
}) {
  const { t } = useI18n()
  // 默认全部保留本地
  const [keepLocal, setKeepLocal] = useState<Set<string>>(
    () => new Set(conflicts.map((item) => conflictKey(item))),
  )

  function toggle(item: MergeConflict, keep: boolean) {
    setKeepLocal((previous) => {
      const next = new Set(previous)
      if (keep) next.add(conflictKey(item))
      else next.delete(conflictKey(item))
      return next
    })
  }

  return (
    <Modal size="lg" label={t('data.conflictTitle', { count: conflicts.length })} onClose={onCancel}>
      <div className="text-sm font-medium">{t('data.conflictTitle', { count: conflicts.length })}</div>
      <p className="mt-1 text-xs text-muted">{t('data.conflictDesc')}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setKeepLocal(new Set(conflicts.map((item) => conflictKey(item))))}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('data.conflictAllLocal')}
        </button>
        <button
          type="button"
          onClick={() => setKeepLocal(new Set())}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('data.conflictAllIncoming')}
        </button>
      </div>

      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {conflicts.map((item) => {
          const key = conflictKey(item)
          const keep = keepLocal.has(key)
          return (
            <li key={key} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                    {t(KIND_LABEL[item.kind])}
                  </span>
                  <span className="text-xs text-fg">{item.label}</span>
                </div>
                <div className="flex shrink-0 rounded-lg border border-line p-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(item, true)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      keep ? 'bg-brand text-on-brand' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {t('data.conflictLocal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(item, false)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      keep ? 'text-muted hover:text-fg' : 'bg-brand text-on-brand'
                    }`}
                  >
                    {t('data.conflictIncoming')}
                  </button>
                </div>
              </div>
              <dl className="mt-1.5 space-y-0.5 text-xs">
                <div className="flex gap-1.5">
                  <dt className={`shrink-0 ${keep ? 'text-fg' : 'text-muted'}`}>
                    {t('data.conflictLocal')}
                  </dt>
                  <dd className={`min-w-0 break-all ${keep ? 'text-fg' : 'text-muted'}`}>
                    {item.localText || t('data.conflictEmptyText')}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className={`shrink-0 ${keep ? 'text-muted' : 'text-fg'}`}>
                    {t('data.conflictIncoming')}
                  </dt>
                  <dd className={`min-w-0 break-all ${keep ? 'text-muted' : 'text-fg'}`}>
                    {item.incomingText || t('data.conflictEmptyText')}
                  </dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onDone(keepLocal)}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
        >
          {t('data.conflictContinue')}
        </button>
      </div>
    </Modal>
  )
}
