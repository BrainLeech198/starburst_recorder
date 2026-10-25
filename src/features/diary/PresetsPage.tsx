/**
 * 日记预设库：常用人物 / 常用地名。
 *
 * 和食物库一样带 hex 短编号、批量删除和回收站：备份里靠编号区分同名的两条，
 * 导入时也能一眼看出哪条是哪条。这里只存名字和分类，正文里的用法交给「常用」弹窗。
 */
import RowCheckbox from '@/shared/ui/RowCheckbox'
import EmptyState from '@/shared/ui/EmptyState'
import { useState } from 'react'
import { Link } from 'react-router'
import type { DiaryPreset, PresetKind } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { newCode, newId } from '@/core/utils/id'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { BAR_BUTTON, BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import {
  diaryPresets,
  removeDiaryPreset,
  removeDiaryPresets,
  restoreDiaryPreset,
  restoreDiaryPresets,
  saveDiaryPreset,
} from './diaryRepo'

type Tab = PresetKind

interface FormState {
  mode: 'create' | 'edit'
  kind: Tab
  preset: DiaryPreset | null
  name: string
}

export default function PresetsPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const presets = useLiveQuery(() => diaryPresets(), [])
  const [tab, setTab] = useState<Tab>('person')
  const [form, setForm] = useState<FormState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DiaryPreset | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const batch = useBatchSelect()

  const rows = (presets ?? []).filter((preset) => preset.kind === tab)
  const empty = presets !== undefined && rows.length === 0
  const selectableIds = rows.map((preset) => preset.id)

  function switchTab(next: Tab) {
    if (next === tab) return
    batch.exit()
    setTab(next)
  }

  function openCreate() {
    setForm({ mode: 'create', kind: tab, preset: null, name: '' })
  }

  function openEdit(preset: DiaryPreset) {
    setForm({ mode: 'edit', kind: preset.kind, preset, name: preset.name })
  }

  async function handleSave() {
    if (!form) return
    const name = form.name.trim()
    if (name === '') {
      showToast({ message: t('presets.nameRequired') })
      return
    }
    const duplicated = (presets ?? []).some(
      (preset) =>
        preset.id !== form.preset?.id &&
        preset.kind === form.kind &&
        preset.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicated) {
      showToast({ message: t('presets.duplicate') })
      return
    }
    const now = Date.now()
    const base = form.preset
    await saveDiaryPreset({
      id: base?.id ?? newId(),
      code: base?.code ?? newCode(),
      kind: form.kind,
      name,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setForm(null)
    showToast({ message: t(base ? 'presets.updated' : 'presets.created') })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    await removeDiaryPreset(target.id)
    showToast({
      message: t('presets.deleted'),
      actionLabel: t('diary.undo'),
      onAction: () => void restoreDiaryPreset(target.id),
    })
  }

  async function handleBatchDelete() {
    const ids = batch.selected
    setBatchDeleteOpen(false)
    await removeDiaryPresets(ids)
    batch.clear()
    showToast({
      message: t('presets.deletedCount', { target: `${ids.length} ${t('presets.unit')}` }),
      actionLabel: t('diary.undo'),
      onAction: () => void restoreDiaryPresets(ids),
    })
  }

  const unit = t('presets.unit')

  return (
    <PageShell
      wide
      title={t('presets.title')}
      description={t(tab === 'person' ? 'presets.hintPerson' : 'presets.hintPlace')}
      backTo="/diary"
      backLabel={t('presets.back')}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/diary/presets/trash" className={SOLID_BUTTON}>
            {t('presets.trash')}
          </Link>
          {!batch.active && (
            <>
              <button type="button" onClick={openCreate} className={SOLID_BUTTON}>
                {t(tab === 'person' ? 'presets.addPerson' : 'presets.addPlace')}
              </button>
              <button
                type="button"
                onClick={() => batch.enter()}
                disabled={empty}
                className={`${SOLID_BUTTON} disabled:opacity-40`}
              >
                {t('presets.batch')}
              </button>
            </>
          )}
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

      {presets === undefined ? null : rows.length === 0 ? (
        <EmptyState
          icon="🏷️"
          text={t(tab === 'person' ? 'presets.emptyPerson' : 'presets.emptyPlace')}
        />
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {rows.map((preset) => {
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
                  <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                    <span className="truncate">{preset.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">{preset.code}</span>
                  </p>
                </div>
                {!batch.active && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => openEdit(preset)} className={BAR_BUTTON}>
                      {t('presets.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(preset)}
                      className={BAR_DANGER}
                    >
                      {t('presets.delete')}
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
            onClick={() => setBatchDeleteOpen(true)}
            disabled={batch.count === 0}
            className={BAR_DANGER}
          >
            {t('presets.delete')}
          </button>
        </BatchActions>
      )}

      {form && (
        <Modal
          size="xs"
          label={t(
            form.mode === 'edit'
              ? form.kind === 'person'
                ? 'presets.editPerson'
                : 'presets.editPlace'
              : form.kind === 'person'
                ? 'presets.addPerson'
                : 'presets.addPlace',
          )}
          onClose={() => setForm(null)}
        >
          <p className="m-0 text-sm font-medium">
            {t(
              form.mode === 'edit'
                ? form.kind === 'person'
                  ? 'presets.editPerson'
                  : 'presets.editPlace'
                : form.kind === 'person'
                  ? 'presets.addPerson'
                  : 'presets.addPlace',
            )}
          </p>
          <label className="mt-3 block">
            <span className="text-xs text-muted">{t('presets.name')}</span>
            <input
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSave()
              }}
              placeholder={t('presets.namePlaceholder')}
              className={`${INPUT} mt-1`}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={OUTLINE_BUTTON}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void handleSave()} className={SOLID_BUTTON}>
              {t('presets.save')}
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('presets.deleteTitle')}
          description={t('presets.deleteBody')}
          confirmLabel={t('presets.delete')}
          tone="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {batchDeleteOpen && (
        <ConfirmDialog
          title={t('presets.deleteSelectedTitle', { target: `${batch.count} ${unit}` })}
          description={t('presets.deleteSelectedBody')}
          confirmLabel={t('presets.delete')}
          tone="danger"
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}
    </PageShell>
  )
}
