/**
 * 「订阅官方频道」二级页：用邮箱订阅，收到重要公告时给你发邮件。
 *
 * 为什么需要邮箱：Web Push 只有浏览器有，安卓与 Windows 安装包的用户收不到任何推送。
 * 邮箱是唯一能覆盖所有平台的通道——用户填一个地址，之后就不用管了。
 *
 * 订阅地址只用于收公告，**不用于别的**，随时可以退订（退订即从服务端删掉）。
 * 本地只记「我订阅过」这个状态，方便下次进来显示当前状态。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { checkSubscription, subscribeEmail, unsubscribeEmail } from '@/platform/channel'

/** 本地记下订阅的邮箱。换个设备重新填一次就行，不进备份 */
const EMAIL_KEY = 'starburst.channelEmail'

function readEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeEmail(email: string): void {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email)
    else localStorage.removeItem(EMAIL_KEY)
  } catch {
    // 隐私模式存不了：不影响订阅本身，只是下次进来要重新填
  }
}

/** 粗校验。真正的验证是服务端收不发得下来，这里只挡明显不是邮箱的 */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@')
  return at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1).includes('.')
}

export default function SubscribePage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [email, setEmail] = useState(readEmail)
  const [subscribed, setSubscribed] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const saved = readEmail()
    if (!saved) {
      // 没有存过地址：直接算「查完了」。放进微任务里，
      // 免得在 effect 里同步 setState 触发一次多余的级联渲染。
      queueMicrotask(() => {
        if (alive) setReady(true)
      })
      return () => {
        alive = false
      }
    }
    void checkSubscription(saved).then((result) => {
      if (!alive) return
      if (result.ok) setSubscribed(result.data === true)
      else setStatusError(result.error || 'request failed')
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  async function handleSubscribe() {
    const value = email.trim()
    if (!looksLikeEmail(value)) {
      showToast({ message: t('subscribe.badEmail') })
      return
    }
    setBusy(true)
    try {
      const ok = await subscribeEmail(value)
      if (ok.ok) {
        writeEmail(value)
        setSubscribed(true)
        setStatusError(null)
        showToast({ message: t('subscribe.done') })
      } else {
        showToast({ message: t('subscribe.failed') })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleUnsubscribe() {
    const value = email.trim()
    if (!value) return
    setBusy(true)
    try {
      const result = await unsubscribeEmail(value)
      if (result.ok) {
        writeEmail('')
        setSubscribed(false)
        setEmail('')
        setStatusError(null)
        showToast({ message: t('subscribe.unsubscribed') })
      } else {
        showToast({ message: t('subscribe.failed') })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t('subscribe.title')}
      description={t('subscribe.description')}
      backTo="/me/settings"
      backLabel={t('common.settings')}
      badge={
        <SettingBadge tone={statusError ? 'bad' : ready && subscribed ? 'ok' : 'plain'}>
          {statusError
            ? t('subscribe.failed')
            : ready
              ? subscribed
                ? t('subscribe.stateOn')
                : t('subscribe.stateOff')
              : '…'}
        </SettingBadge>
      }
    >
      <SettingCard>
        <SettingGroup label={t('subscribe.emailGroup')} first>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder={t('subscribe.emailPlaceholder')}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">{t('subscribe.emailHint')}</p>
          {statusError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {t('subscribe.failed')}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {subscribed ? (
              <button
                type="button"
                onClick={() => void handleUnsubscribe()}
                disabled={busy}
                className={`${OUTLINE_BUTTON} flex-1`}
              >
                {t('subscribe.unsubscribe')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubscribe()}
                disabled={busy}
                className={`${SOLID_BUTTON} flex-1`}
              >
                {t('subscribe.subscribe')}
              </button>
            )}
          </div>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
