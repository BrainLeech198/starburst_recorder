/**
 * 「插入 → 常用」弹窗：分常用人物 / 常用地名两栏，点名字就插到正文里。
 * 数据来自预设库；这里不写库，只负责挑和插。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import type { PresetKind } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { choiceTile } from '@/shared/ui/buttonStyles'
import { diaryPresets } from './diaryRepo'

export default function CommonPresetDialog({
  onInsert,
  onClose,
}: {
  onInsert: (name: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const presets = useLiveQuery(() => diaryPresets(), [])
  const [tab, setTab] = useState<PresetKind>('person')

  const rows = (presets ?? []).filter((preset) => preset.kind === tab)

  return (
    <Modal size="sm" label={t('presetPick.title')} onClose={onClose}>
      <div className="text-sm font-medium">{t('presetPick.title')}</div>
      <p className="mt-1 text-xs text-muted">{t('presetPick.hint')}</p>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setTab('person')}
          className={choiceTile(tab === 'person', 'px-3 py-1.5 text-sm')}
        >
          {t('presetPick.person')}
        </button>
        <button
          type="button"
          onClick={() => setTab('place')}
          className={choiceTile(tab === 'place', 'px-3 py-1.5 text-sm')}
        >
          {t('presetPick.place')}
        </button>
      </div>

      {presets === undefined ? (
        <p className="mt-4 text-xs text-muted">{t('common.reading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted">
          {t(tab === 'person' ? 'presetPick.emptyPerson' : 'presetPick.emptyPlace')}
        </p>
      ) : (
        <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
          {rows.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onInsert(preset.name)
                onClose()
              }}
              title={preset.code}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg transition-colors hover:border-brand hover:text-brand"
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Link to="/diary/presets" className="text-xs text-brand underline">
          {t('presetPick.manage')}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
