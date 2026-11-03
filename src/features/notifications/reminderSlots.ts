/**
 * 把本地的提醒设置压成一份「只有时间、没有内容」的清单，交给服务端定时推送。
 *
 * 为什么只有时间和类别：Web Push 要在应用关着的时候推送，服务端就必须先知道「几点推」；
 * 但日程标题、训练内容、体重这些是用户自己的事，不该为了一个提醒离开设备。
 * 推送文案在订阅时由客户端给一份**通用版本**（见 `buildPushCopy`），服务端只负责到点取用。
 *
 * 这样做的代价是推送内容比较笼统（「你设的日程到点了」而不是「9:30 看牙医」），
 * 换来的是「数据不出设备」这条底线不破。要更具体就得改口径，见 docs/PWA-IOS.md §9。
 */
import type { HealthProfile, ScheduleItem } from '@/core/db/schema'
import type { MessageParams } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { PushCopy, ReminderCategory, ReminderSlot } from '@/platform/push'
import { isRemindableLater } from '@/features/schedule/scheduleMath'
import { normalizePlan } from '@/features/training/trainingPlan'

type Translate = (key: MessageKey, params?: MessageParams) => string

/** 一天最多给多少条日程提醒留位：再多也没人看，还会把订阅文档撑大 */
const MAX_SCHEDULE_SLOTS = 20

/** `HH:MM` 才算有时刻；全天日程（空串）不参与推送 */
function validTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/** 项目里「周一=1 … 周日=7」，推送侧统一用 JS 的「周日=0 … 周六=6」 */
function toSundayZero(day: number): number {
  return ((day % 7) + 7) % 7
}

function sortedWeekdays(days: number[]): number[] {
  return [...new Set(days.map(toSundayZero))].sort((a, b) => a - b)
}

/**
 * 生成当前应该交给服务端的全部提醒位。
 * 没有提醒就是空数组——服务端收到空数组会停止推送，不需要单独发「取消」。
 */
export function buildReminderSlots(
  profile: HealthProfile | undefined,
  items: ScheduleItem[],
  today: string,
): ReminderSlot[] {
  const slots: ReminderSlot[] = []

  if (profile?.weighDay && validTime(profile.weighTime)) {
    slots.push({
      id: 'weigh',
      category: 'weigh',
      time: profile.weighTime,
      weekdays: [toSundayZero(profile.weighDay)],
    })
  }

  const plan = normalizePlan(profile?.trainingPlan)
  if (plan.enabled && plan.weeklyDays.length > 0 && validTime(plan.time)) {
    slots.push({
      id: 'training',
      category: 'training',
      time: plan.time,
      weekdays: sortedWeekdays(plan.weeklyDays),
    })
  }

  let scheduleCount = 0
  for (const item of items) {
    if (scheduleCount >= MAX_SCHEDULE_SLOTS) break
    // 和本地提醒用同一套口径：开了提醒、没删、一次性日程只在未来 30 天内
    if (!isRemindableLater(item, today)) continue
    if (!validTime(item.time)) continue

    if (item.repeat === 'none') {
      slots.push({
        id: `schedule:${item.id}:${item.dateKey}`,
        category: 'schedule',
        time: item.time,
        date: item.dateKey,
      })
    } else if (item.repeat === 'daily') {
      slots.push({
        id: `schedule:${item.id}`,
        category: 'schedule',
        time: item.time,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      })
    } else {
      const weekdays = sortedWeekdays(item.weeklyDays)
      if (weekdays.length === 0) continue
      slots.push({ id: `schedule:${item.id}`, category: 'schedule', time: item.time, weekdays })
    }
    scheduleCount += 1
  }

  return slots
}

/**
 * 推送文案：服务端不认语言，所以订阅时把当前语言的通用文案一起交过去。
 * 里面不含任何用户内容——这三句对所有用户都一模一样。
 */
export function buildPushCopy(t: Translate): Record<ReminderCategory, PushCopy> {
  return {
    weigh: { title: t('health.weighTitle'), body: t('health.weighToday') },
    training: { title: t('training.plan.notifyTitle'), body: t('training.plan.notifyBody') },
    schedule: { title: t('schedule.notifyTitle'), body: t('push.scheduleBody') },
  }
}
