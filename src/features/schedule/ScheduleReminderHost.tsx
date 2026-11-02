/**
 * 日程提醒的宿主：壳层里挂一次，全局一个。
 *
 * 打开应用时查一遍日程，之后每分钟再判断一次「到点没有」；
 * 安卓侧顺带把本地通知按当前设置重排。页面不需要自己管提醒。
 */
import { useEffect, useMemo } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { schedules } from './scheduleRepo'
import { maybeNotifySchedules, syncScheduleReminders } from './scheduleNotify'

export default function ScheduleReminderHost() {
  const rows = useLiveQuery(() => schedules(), [])
  // useLiveQuery 在第一次结果回来前是 undefined；固定成同一个空数组，
  // 否则每次渲染都换引用，两个 effect 会跟着不停重跑
  const items = useMemo(() => rows ?? [], [rows])

  useEffect(() => {
    // 数据一到位就先判断一次，再每分钟查一次：纯本地比较，很便宜
    maybeNotifySchedules(items)
    const timer = window.setInterval(() => maybeNotifySchedules(items), 60_000)
    return () => window.clearInterval(timer)
  }, [items])

  useEffect(() => {
    void syncScheduleReminders(items)
  }, [items])

  return null
}
