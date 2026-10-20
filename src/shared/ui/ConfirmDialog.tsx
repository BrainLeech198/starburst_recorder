import Modal from './Modal'

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = '确定',
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
  return (
    <Modal size="xs" onClose={onCancel}>
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-2 text-xs text-muted">{description}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={[
            'rounded-lg border px-3 py-1.5 text-sm transition-colors',
            tone === 'danger' ? 'border-danger text-danger' : 'border-brand text-brand',
          ].join(' ')}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
