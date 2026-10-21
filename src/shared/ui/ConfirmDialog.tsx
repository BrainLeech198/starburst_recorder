import Modal from './Modal'
import { useI18n } from '@/shared/i18n/context'

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string
  description?: string
  confirmLabel?: string
  /** 危险操作（删除 / 清空）用红色；会上写数据但不算删除的（导入这类）用主题色 */
  tone?: 'danger' | 'brand'
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <Modal size="xs" label={title} onClose={onCancel}>
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-2 text-xs text-muted">{description}</p>}

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
          onClick={onConfirm}
          className={[
            'rounded-lg border px-3 py-1.5 text-sm transition-colors',
            tone === 'danger' ? 'border-danger text-danger' : 'border-brand text-brand',
          ].join(' ')}
        >
          {confirmLabel ?? t('common.confirm')}
        </button>
      </div>
    </Modal>
  )
}
