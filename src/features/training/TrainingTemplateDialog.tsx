import type { TrainingTemplate } from '@/core/db/schema'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, ROW_DANGER, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'

export default function TrainingTemplateDialog({
  templates,
  onUse,
  onDelete,
  onClose,
}: {
  templates: TrainingTemplate[]
  onUse: (template: TrainingTemplate) => void
  onDelete: (template: TrainingTemplate) => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <Modal size="sm" label={t('training.template.title')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('training.template.title')}</h2>
      {templates.length === 0 ? (
        <p className="m-0 mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          {t('training.template.empty')}
        </p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-2 p-0">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-2 rounded-xl border border-line p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{template.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">
                  {t(`training.kind.${template.kind}` as MessageKey)} ·{' '}
                  {t('training.exerciseCount', { n: template.exercises.length })}
                </span>
              </span>
              <button type="button" onClick={() => onDelete(template)} className={ROW_DANGER}>
                {t('common.delete')}
              </button>
              <button type="button" onClick={() => onUse(template)} className={SOLID_BUTTON}>
                <Icon name="plus" />
                {t('training.template.start')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>{t('common.close')}</button>
      </div>
    </Modal>
  )
}
