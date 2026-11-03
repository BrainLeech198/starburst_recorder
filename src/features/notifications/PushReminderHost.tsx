/**
 * 推送清单的宿主：壳层里挂一次，全局一个。
 *
 * 只做一件事——把「称重 / 训练 / 日程」的提醒时间算成清单，在**已经订阅过**的前提下
 * 同步给服务端。没订阅就完全不做事：不申请权限、不发请求，用户没主动开启之前
 * 这个组件是零成本的。
 *
 * 清单没变时 `syncPushSlots` 会按指纹短路，所以这里不用自己防抖。
 */
import { useEffect, useMemo } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { healthProfile } from '@/features/health/healthRepo'
import { schedules } from '@/features/schedule/scheduleRepo'
import { syncPushSlots } from '@/platform/push'
import { buildPushCopy, buildReminderSlots } from './reminderSlots'

export default function PushReminderHost() {
  const { t } = useI18n()
  const profile = useLiveQuery(() => healthProfile(), [])
  const rows = useLiveQuery(() => schedules(), [])
  // useLiveQuery 第一次结果回来前是 undefined；固定成同一个空数组，避免 effect 反复重跑
  const items = useMemo(() => rows ?? [], [rows])

  useEffect(() => {
    void syncPushSlots(buildReminderSlots(profile, items, todayKey()), buildPushCopy(t))
  }, [profile, items, t])

  return null
}
