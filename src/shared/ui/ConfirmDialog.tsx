import Modal from './Modal'
import { useI18n } from '@/shared/i18n/context'

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string
  description?: string
  confirmLabel?: string
  /** 取消按钮的文字，默认「取消」；例如「继续编辑」 */
  cancelLabel?: string
  /** 危险操作（删除 / 清空）用红色；可恢复的操作（放入回收站）用黄色；会上写数据但不算删除的（导入这类）用主题色 */
  tone?: 'danger' | 'brand' | 'warn'
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
          {cancelLabel ?? t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={[
            'rounded-lg border px-3 py-1.5 text-sm transition-colors',
            tone === 'danger'
              ? 'border-danger text-danger'
              : tone === 'warn'
                ? 'border-warning text-warning'
                : 'border-brand text-brand',
          ].join(' ')}
        >
          {confirmLabel ?? t('common.confirm')}
        </button>
      </div>
    </Modal>
  )
}
