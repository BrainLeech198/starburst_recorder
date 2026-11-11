/** 食物库编辑前选择同步范围，沿用摄入记录编辑选项的布局与交互。 */
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { Icon } from '@/shared/ui/icons'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'

const CHOICE =
  'block w-full rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-brand'

export default function FoodEditChoiceDialog({
  name,
  onLibraryOnly,
  onSyncIntakes,
  onCancel,
}: {
  name: string
  onLibraryOnly: () => void
  onSyncIntakes: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <Modal size="sm" label={t('foods.editChoiceTitle')} onClose={onCancel}>
      <h2 className="m-0 text-base font-medium text-fg">{t('foods.editChoiceTitle')}</h2>
      <p className="m-0 mt-1 truncate text-xs text-muted">{name}</p>

      <div className="mt-4 space-y-2">
        <button type="button" onClick={onLibraryOnly} className={CHOICE}>
          <span className="flex items-center gap-2 text-sm text-fg">
            <Icon name="edit" className="mr-0 h-4 w-4 shrink-0" />
            {t('foods.editLibraryOnly')}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {t('foods.editLibraryOnlyHint')}
          </span>
        </button>
        <button type="button" onClick={onSyncIntakes} className={CHOICE}>
          <span className="flex items-center gap-2 text-sm text-fg">
            <Icon name="refresh" className="mr-0 h-4 w-4 shrink-0" />
            {t('foods.editSyncIntakes')}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {t('foods.editSyncIntakesHint')}
          </span>
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
