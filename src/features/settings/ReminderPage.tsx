/**
 * 「关掉应用也能提醒」：网页版 / PWA 的 Web Push 开关。
 *
 * 这一页只在网页版有意义——桌面壳与安卓壳各有自己的系统通知，走不到这里
 * （设置页的那一行也会跟着隐藏）。
 *
 * 关键约束写在按钮行为里：`enablePush` 必须在点击的同一轮里发起权限申请，
 * iOS 只认用户手势，中间夹了别的 await 就直接给 denied。
 */
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { healthProfile } from '@/features/health/healthRepo'
import { schedules } from '@/features/schedule/scheduleRepo'
import { buildPushCopy, buildReminderSlots } from '@/features/notifications/reminderSlots'
import {
  disablePush,
  enablePush,
  existingSubscription,
  pushState,
  type PushState,
} from '@/platform/push'

const STATE_TEXT: Record<PushState, MessageKey> = {
  unsupported: 'push.stateUnavailable',
  unconfigured: 'push.stateUnavailable',
  'needs-install': 'push.stateNeedsInstall',
  denied: 'push.stateDenied',
  off: 'push.stateOff',
  on: 'push.stateOn',
}

export default function ReminderPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const profile = useLiveQuery(() => healthProfile(), [])
  const rows = useLiveQuery(() => schedules(), [])
  const items = useMemo(() => rows ?? [], [rows])
  const [subscribed, setSubscribed] = useState(false)
  /** 订阅状态是异步查的；查完之前不给按钮，避免点了没反应 */
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void existingSubscription().then((subscription) => {
      setSubscribed(Boolean(subscription))
      setReady(true)
    })
  }, [])

  const state = pushState(subscribed)
  const canToggle = ready && !busy && (state === 'off' || state === 'on')

  async function handleToggle() {
    setBusy(true)
    try {
      if (subscribed) {
        await disablePush()
        setSubscribed(false)
        return
      }
      const slots = buildReminderSlots(profile, items, todayKey())
      const ok = await enablePush(slots, buildPushCopy(t))
      setSubscribed(ok)
      showToast({ message: ok ? t('push.enabled') : t('push.enableFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t('push.title')}
      description={t('push.description')}
      backTo="/me/settings"
      backLabel={t('common.settings')}
      badge={<SettingBadge>{ready ? t(STATE_TEXT[state]) : '…'}</SettingBadge>}
    >
      <SettingCard>
        <SettingGroup label={t('push.title')} first>
          <p className="text-xs text-muted">{t(STATE_TEXT[state])}</p>
          {canToggle && (
            <button
              type="button"
              onClick={() => void handleToggle()}
              className={`${OUTLINE_BUTTON} mt-3`}
            >
              {subscribed ? t('push.disable') : t('push.enable')}
            </button>
          )}
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
