/**
 * 「用口令加密 AI 密钥」的弹窗，导出与导入共用一个。
 *
 * 为什么只加密密钥、不加密整份备份：见 `secretBox.ts` 顶部——密钥可再生，
 * 日记不可再生。给整份文件上口令，一旦忘记赔进去的是不可恢复的数据。
 *
 * 两种模式的行为差异都在按钮上：
 *   - encrypt：口令留空 = 明文导出（按钮文案会跟着变，不让人糊里糊涂点下去）
 *   - decrypt：口令必填；另有「跳过」——忘了口令也能把其它数据导进来，只是密钥清空
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'

export default function SecretDialog({
  mode,
  busy = false,
  onCancel,
  onSubmit,
}: {
  mode: 'encrypt' | 'decrypt'
  busy?: boolean
  onCancel: () => void
  /** encrypt 时可能是空串（=不加密）；decrypt 时空串表示跳过 */
  onSubmit: (passphrase: string) => void
}) {
  const { t } = useI18n()
  const [passphrase, setPassphrase] = useState('')
  const encrypt = mode === 'encrypt'
  const trimmed = passphrase.trim()

  return (
    <Modal
      size="sm"
      label={t(encrypt ? 'data.secretEncryptTitle' : 'data.secretDecryptTitle')}
      onClose={busy ? undefined : onCancel}
    >
      <p className="m-0 text-sm text-fg">
        {t(encrypt ? 'data.secretEncryptTitle' : 'data.secretDecryptTitle')}
      </p>
      <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
        {t(encrypt ? 'data.secretEncryptBody' : 'data.secretDecryptBody')}
      </p>

      <input
        type="password"
        value={passphrase}
        autoComplete="new-password"
        autoFocus
        placeholder={t('data.secretPlaceholder')}
        onChange={(event) => setPassphrase(event.target.value)}
        className={`${INPUT} mt-3`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (trimmed !== '' || encrypt)) onSubmit(trimmed)
        }}
      />

      <div className="mt-3 flex gap-2">
        {encrypt ? (
          <button type="button" onClick={onCancel} className={`${OUTLINE_BUTTON} flex-1`}>
            {t('common.cancel')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSubmit('')}
            className={`${OUTLINE_BUTTON} flex-1`}
            disabled={busy}
          >
            {t('data.secretSkip')}
          </button>
        )}
        <button
          type="button"
          disabled={busy || (!encrypt && trimmed === '')}
          onClick={() => onSubmit(trimmed)}
          className={`${SOLID_BUTTON} flex-1`}
        >
          {t(
            encrypt
              ? trimmed === ''
                ? 'data.secretExportPlain'
                : 'data.secretEncryptConfirm'
              : 'data.secretDecryptConfirm',
          )}
        </button>
      </div>
    </Modal>
  )
}
