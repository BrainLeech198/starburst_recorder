import { useState } from 'react'
import Modal from './Modal'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'
import { useI18n } from '@/shared/i18n/context'
import { useCareMode } from '@/shared/care/careContext'

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
  // 长辈关怀的「防误触」：危险操作要点两次才真删，第一次只是把按钮变成「再点一次确认」
  const { state } = useCareMode()
  const [armed, setArmed] = useState(false)
  const needsArm = state.care && state.guard && tone === 'danger'

  return (
    <Modal size="xs" label={title} onClose={onCancel}>
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-2 text-xs text-muted">{description}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={GHOST_BUTTON}
        >
          {cancelLabel ?? t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (needsArm && !armed) {
              setArmed(true)
              return
            }
            onConfirm()
          }}
          className={[
            'rounded-lg border px-3 py-1.5 text-sm transition-colors',
            tone === 'danger'
              ? 'border-danger text-danger'
              : tone === 'warn'
                ? 'border-warning text-warning'
                : 'border-brand text-brand',
          ].join(' ')}
        >
          {needsArm && !armed ? t('care.guardConfirmAgain') : (confirmLabel ?? t('common.confirm'))}
        </button>
      </div>
    </Modal>
  )
}
