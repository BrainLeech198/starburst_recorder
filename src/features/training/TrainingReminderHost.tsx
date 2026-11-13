import { useEffect } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { todayKey } from '@/core/utils/dateKey'
import { healthProfile } from '@/features/health/healthRepo'
import { daysBetween } from './trainingMath'
import { latestTraining } from './trainingRepo'
import { maybeNotifyTraining, syncTrainingReminder } from './trainingNotify'

/** Keep training reminders active independently of which page is open. */
export default function TrainingReminderHost() {
  const profile = useLiveQuery(() => healthProfile(), [])
  const latest = useLiveQuery(() => latestTraining(), [])

  useEffect(() => {
    void syncTrainingReminder(profile?.trainingPlan)
  }, [profile?.trainingPlan])

  useEffect(() => {
    const check = () => {
      const gapDays = latest ? daysBetween(latest.dateKey, todayKey()) : -1
      maybeNotifyTraining(profile?.trainingPlan, gapDays === 0, gapDays)
    }
    check()
    const timer = window.setInterval(check, 60_000)
    return () => window.clearInterval(timer)
  }, [profile?.trainingPlan, latest])

  return null
}
