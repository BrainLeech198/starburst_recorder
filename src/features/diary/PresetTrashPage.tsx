/** 预设库回收站：和食物库回收站一样，能单条恢复/彻底删除，也能批量。 */
import RowCheckbox from '@/shared/ui/RowCheckbox'
import { useState } from 'react'
import type { DiaryPreset, PresetKind } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import {
  BAR_BUTTON,
  BAR_DANGER,
  SOLID_BUTTON,
  SOLID_DANGER,
  choiceTile,
} from '@/shared/ui/buttonStyles'
import {
  purgeDiaryPreset,
  restoreDiaryPreset,
  restoreDiaryPresets,
  trashedDiaryPresets,
} from './diaryRepo'

type Pending = { kind: 'one' | 'batch' | 'clear'; id?: string }

export default function PresetTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const rows = useLiveQuery(() => trashedDiaryPresets(), [])
  const [tab, setTab] = useState<PresetKind>('person')
  const [pending, setPending] = useState<Pending | null>(null)
  const batch = useBatchSelect()

  const current = (rows ?? []).filter((preset) => preset.kind === tab)
  const count = current.length
  const isEmpty = rows !== undefined && count === 0
  const selectableIds = current.map((preset) => preset.id)
  const unit = t('presets.unit')

  function switchTab(next: PresetKind) {
    if (next === tab) return
    batch.exit()
    setTab(next)
  }

  async function handleRestore(preset: DiaryPreset) {
    await restoreDiaryPreset(preset.id)
    showToast({ message: t('presets.restored') })
  }

  async function handleBatchRestore() {
    const ids = batch.selected
    await restoreDiaryPresets(ids)
    batch.clear()
    if (ids.length >= count) batch.exit()
    showToast({ message: t('presets.restoredCount', { target: `${ids.length} ${unit}` }) })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'clear') {
      // 只清当前分类：另一种分类的回收站原样留着
      const ids = current.map((preset) => preset.id)
      await Promise.all(ids.map((id) => purgeDiaryPreset(id)))
      showToast({ message: t('presets.clearedTrash') })
      return
    }
    if (target.kind === 'batch') {
      const ids = batch.selected
      await Promise.all(ids.map((id) => purgeDiaryPreset(id)))
      batch.clear()
      if (ids.length >= count) batch.exit()
      showToast({ message: t('presets.purgedCount', { target: `${ids.length} ${unit}` }) })
      return
    }
    if (target.kind === 'one' && target.id) {
      await purgeDiaryPreset(target.id)
      showToast({ message: t('presets.purged') })
    }
  }

  return (
    <PageShell
      wide
      title={t('presets.trashTitle')}
      backTo="/diary/presets"
      backLabel={t('presets.backList')}
      actions={
        <div className="flex items-center gap-2">
          {!batch.active && !isEmpty && (
            <button type="button" onClick={batch.enter} className={SOLID_BUTTON}>
              {t('presets.batch')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPending({ kind: 'clear' })}
            disabled={isEmpty || batch.active}
            className={`${SOLID_DANGER} disabled:opacity-40`}
          >
            {t('presets.clearTrash')}
          </button>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => switchTab('person')}
          className={choiceTile(tab === 'person', 'px-3 py-1.5 text-sm')}
        >
          {t('presets.person')}
        </button>
        <button
          type="button"
          onClick={() => switchTab('place')}
          className={choiceTile(tab === 'place', 'px-3 py-1.5 text-sm')}
        >
          {t('presets.place')}
        </button>
      </div>

      <p className="m-0 text-xs text-muted">
        {rows === undefined ? t('common.reading') : t('presets.trashHint', { count })}
      </p>

      {isEmpty && (
        <p className="mt-6 text-center text-sm text-muted">{t('presets.trashEmpty')}</p>
      )}

      {rows !== undefined && count > 0 && (
        <ul className="mt-4 space-y-2">
          {current.map((preset) => {
            const selected = batch.isSelected(preset.id)
            return (
              <li
                key={preset.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                }`}
              >
                {batch.active && (
                  <RowCheckbox
                    checked={selected}
                    label={preset.name}
                    onToggle={() => batch.toggle(preset.id)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm text-fg">{preset.name}</p>
                  <p className="m-0 mt-0.5 font-mono text-[11px] text-muted">
                    {t('presets.codeDeletedAt', {
                      code: preset.code,
                      at: formatStamp(preset.deletedAt ?? 0),
                    })}
                  </p>
                </div>
                {!batch.active && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void handleRestore(preset)}
                      className={BAR_BUTTON}
                    >
                      {t('presets.restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'one', id: preset.id })}
                      className={BAR_DANGER}
                    >
                      {t('presets.purge')}
                    </button>
                  </div>
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
            disabled={batch.count === 0}
            className={BAR_BUTTON}
          >
            {t('presets.restore')}
          </button>
          <button
            type="button"
            onClick={() => setPending({ kind: 'batch' })}
            disabled={batch.count === 0}
            className={BAR_DANGER}
          >
            {t('presets.purge')}
          </button>
        </BatchActions>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'clear'
              ? t('presets.clearTrashTitle')
              : pending.kind === 'batch'
                ? t('presets.purgeSelectedTitle', {
                    target: `${batch.count} ${unit}`,
                  })
                : t('presets.purge')
          }
          description={
            pending.kind === 'clear'
              ? t('presets.clearTrashBody')
              : pending.kind === 'batch'
                ? t('presets.purgeSelectedBody')
                : t('presets.clearTrashBody')
          }
          confirmLabel={t('presets.purge')}
          tone="danger"
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
