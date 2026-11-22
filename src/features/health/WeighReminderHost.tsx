import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from '@/core/db/live'
import { healthProfile } from './healthRepo'
import { maybeNotifyWeighDay, syncWeighReminder } from './weighNotify'

/** Keep weigh reminders alive regardless of the page the user has open. */
export default function WeighReminderHost() {
  const profile = useLiveQuery(() => healthProfile(), [])
  const loaded = profile !== undefined
  const hasProfile = Boolean(profile)
  const weighDay = profile?.weighDay ?? null
  const weighTime = profile?.weighTime ?? '07:00'

  useEffect(() => {
    if (!loaded) return
    const settings = hasProfile ? { weighDay, weighTime } : null
    const sync = () => void syncWeighReminder(settings)
    sync()
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loaded, hasProfile, weighDay, weighTime])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const check = () => maybeNotifyWeighDay(profile)
    check()
    const timer = window.setInterval(check, 60_000)
    return () => window.clearInterval(timer)
  }, [profile])

  return null
}
