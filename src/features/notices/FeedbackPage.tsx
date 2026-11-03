/**
 * 「给官方反馈」二级页：写一段话提交给作者。
 *
 * 刻意做得很简单：一个输入框 + 一个发送按钮，没有工单号、没有分类、
 * 不用注册。反馈内容连同提交时间存在服务端，作者用管理脚本查看。
 *
 * 反馈**不进备份**：它一旦发出去就已经在服务端了，本地再留一份没有意义。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingGroup } from '@/shared/ui/SettingCard'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { submitFeedback } from '@/platform/channel'

/** 正文上限。与服务端一致，超出的部分会被截断 */
const MAX_LENGTH = 4000

export default function FeedbackPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    const body = text.trim()
    if (!body) {
      showToast({ message: t('feedback.empty') })
      return
    }
    setBusy(true)
    try {
      const ok = await submitFeedback(body)
      if (ok) {
        setText('')
        showToast({ message: t('feedback.sent') })
      } else {
        showToast({ message: t('feedback.failed') })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t('feedback.title')}
      description={t('feedback.description')}
      backTo="/me/settings"
      backLabel={t('common.settings')}
    >
      <SettingCard>
        <SettingGroup label={t('feedback.inputGroup')} first>
          <textarea
            value={text}
            rows={6}
            maxLength={MAX_LENGTH}
            placeholder={t('feedback.placeholder')}
            onChange={(event) => setText(event.target.value)}
            className={`${INPUT} resize-y leading-relaxed`}
          />
          <p className="mt-2 text-xs text-muted">
            {t('feedback.counter', { count: text.length, max: MAX_LENGTH })}
          </p>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || text.trim() === ''}
            className={`${SOLID_BUTTON} mt-3 w-full`}
          >
            {busy ? t('feedback.sending') : t('feedback.send')}
          </button>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
