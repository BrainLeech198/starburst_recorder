/**
 * 编辑摄入前先问一句：只改这条历史记录，还是连食物库一起改。
 *
 * 只有这条摄入确实来自食物库时才弹；手动记录和套餐成分快照直接进编辑页。
 */
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'

const CHOICE =
  'block w-full rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-brand'

export default function IntakeEditChoiceDialog({
  name,
  onSingle,
  onSync,
  onCancel,
}: {
  name: string
  onSingle: () => void
  onSync: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <Modal size="sm" label={t('health.intakeEditChoiceTitle')} onClose={onCancel}>
      <h2 className="m-0 text-base font-medium text-fg">
        {t('health.intakeEditChoiceTitle')}
      </h2>
      <p className="m-0 mt-1 truncate text-xs text-muted">{name}</p>

      <div className="mt-4 space-y-2">
        <button type="button" onClick={onSingle} className={CHOICE}>
          <span className="block text-sm text-fg">{t('health.intakeEditSingle')}</span>
          <span className="mt-0.5 block text-xs text-muted">{t('health.intakeEditSingleHint')}</span>
        </button>
        <button type="button" onClick={onSync} className={CHOICE}>
          <span className="block text-sm text-fg">{t('health.intakeEditSync')}</span>
          <span className="mt-0.5 block text-xs text-muted">{t('health.intakeEditSyncHint')}</span>
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
