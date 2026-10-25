import type { ExportFormat } from './diaryExport'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'

const OPTIONS: { id: ExportFormat; label?: string; labelKey?: MessageKey; hintKey: MessageKey }[] = [
  { id: 'markdown', label: 'Markdown', hintKey: 'export.markdownHint' },
  { id: 'text', labelKey: 'export.textLabel', hintKey: 'export.textHint' },
  { id: 'json', label: 'JSON', hintKey: 'export.jsonHint' },
]

export default function ExportDialog({
  target,
  onPick,
  onCancel,
}: {
  /** 「3 条日记」这类已经带好量词的说法 */
  target: string
  onPick: (format: ExportFormat) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal size="xs" label={t('export.title', { target })} onClose={onCancel}>
      <div className="text-sm font-medium">{t('export.title', { target })}</div>
      <p className="mt-2 text-xs text-muted">{t('export.hint')}</p>

      <div className="mt-3 flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.id)}
            className="rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand"
          >
            <span className="block text-sm text-fg">
              {option.labelKey ? t(option.labelKey) : option.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{t(option.hintKey)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className={GHOST_BUTTON}
        >
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
