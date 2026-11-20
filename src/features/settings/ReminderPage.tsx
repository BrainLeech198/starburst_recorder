/** 跨平台提醒权限与订阅设置。 */
import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from '@/core/db/live'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { healthProfile } from '@/features/health/healthRepo'
import { syncWeighReminder } from '@/features/health/weighNotify'
import { schedules } from '@/features/schedule/scheduleRepo'
import { syncScheduleReminders } from '@/features/schedule/scheduleNotify'
import { syncTrainingReminder } from '@/features/training/trainingNotify'
import { buildPushCopy, buildReminderSlots } from '@/features/notifications/reminderSlots'
import { desktopBridge } from '@/platform/desktop'
import { requestNotificationPermission } from '@/platform/notify'
import {
  disablePush,
  enablePush,
  existingSubscription,
  pushState,
  pushSupported,
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

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'default'

export default function ReminderPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const profile = useLiveQuery(() => healthProfile(), [])
  const rows = useLiveQuery(() => schedules(), [])
  const items = useMemo(() => rows ?? [], [rows])
  const native = Capacitor.isNativePlatform()
  const desktop = Boolean(desktopBridge()?.isDesktop)
  const webPush = !native && !desktop && pushSupported()
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<PermissionState>('default')
  /** 订阅与系统权限都是异步查询；查完之前不给按钮，避免点了没反应 */
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (native) {
          const { LocalNotifications } = await import('@capacitor/local-notifications')
          const state = await LocalNotifications.checkPermissions()
          if (active) setPermission(state.display as PermissionState)
        } else if (webPush) {
          const subscription = await existingSubscription()
          if (active) setSubscribed(Boolean(subscription))
        } else {
          setPermission(typeof Notification === 'undefined' ? 'denied' : Notification.permission)
        }
      } catch {
        if (active) setPermission('denied')
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => { active = false }
  }, [native, webPush])

  const state = pushState(subscribed)
  const permissionKey: MessageKey = permission === 'granted'
    ? 'push.stateOn'
    : permission === 'denied'
      ? 'push.stateDenied'
      : 'push.stateOff'
  const badgeKey = webPush ? STATE_TEXT[state] : permissionKey
  const canTogglePush = ready && !busy && webPush && (state === 'off' || state === 'on')
  const canRequestPermission = ready && !busy && permission !== 'granted' && permission !== 'denied'

  async function handleTogglePush() {
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

  async function handleNativePermission() {
    setBusy(true)
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const result = await LocalNotifications.requestPermissions()
      setPermission(result.display as PermissionState)
      if (result.display === 'granted') {
        await Promise.all([
          syncScheduleReminders(items),
          syncWeighReminder(profile),
          syncTrainingReminder(profile?.trainingPlan),
        ])
        showToast({ message: t('push.enabled') })
      } else {
        showToast({ message: t('push.enableFailed') })
      }
    } catch {
      showToast({ message: t('push.enableFailed') })
    } finally {
      setBusy(false)
    }
  }

  async function handleBrowserPermission() {
    setBusy(true)
    const granted = await requestNotificationPermission()
    setPermission(typeof Notification === 'undefined' ? 'denied' : Notification.permission)
    showToast({ message: granted ? t('push.enabled') : t('push.enableFailed') })
    setBusy(false)
  }

  return (
    <PageShell
      title={t('push.title')}
      description={t('push.description')}
      backTo="/me/settings"
      backLabel={t('common.settings')}
      badge={<SettingBadge>{ready ? t(badgeKey) : '…'}</SettingBadge>}
    >
      <SettingCard>
        <SettingGroup label={t('push.title')} first>
          <p className="text-xs text-muted">{t(badgeKey)}</p>
          {webPush && canTogglePush && (
            <button type="button" onClick={() => void handleTogglePush()} className={`${OUTLINE_BUTTON} mt-3`}>
              {subscribed ? t('push.disable') : t('push.enable')}
            </button>
          )}
          {native && canRequestPermission && rows !== undefined && (
            <button type="button" onClick={() => void handleNativePermission()} className={`${OUTLINE_BUTTON} mt-3`}>
              {t('push.enable')}
            </button>
          )}
          {!native && !webPush && canRequestPermission && (
            <button type="button" onClick={() => void handleBrowserPermission()} className={`${OUTLINE_BUTTON} mt-3`}>
              {t('push.enable')}
            </button>
          )}
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
