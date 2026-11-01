/**
 * 训练提醒的系统通知：计划提醒（周几 + 时刻）与断档提醒（连续 N 天没练）。
 *
 * - 桌面 / 浏览器：打开应用后前台检查，到点弹一次 Web Notification
 * - 安卓：计划提醒排成本地通知，关掉应用也会弹；断档提醒仍靠前台检查
 *
 * 两个提醒互相独立，都只在「今天还没提醒过」时发一次。
 */
import type { TrainingPlan } from '@/core/db/schema'
import { translate } from '@/shared/i18n/context'
import { todayKey } from '@/core/utils/dateKey'
import { isPlanDay, isTimeReached, normalizePlan, notificationWeekday, shouldNudge } from './trainingPlan'

/** 计划提醒按周几各排一条，id 从 77130 起；断档提醒固定 77140，避开称重的 77120 */
const PLAN_NOTIFICATION_BASE = 77130
const NUDGE_NOTIFICATION_ID = 77140
const PLAN_IDS = [0, 1, 2, 3, 4, 5, 6].map((index) => PLAN_NOTIFICATION_BASE + index)
const ALL_IDS = [...PLAN_IDS, NUDGE_NOTIFICATION_ID]
const NOTIFIED_KEY = 'starburst.trainingNotified'
const NUDGE_KEY = 'starburst.trainingNudged'

function localDay(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function markDay(key: string, day: string) {
  try {
    localStorage.setItem(key, day)
  } catch {
    // 隐私模式存不了标记：最多明天再提醒一次
  }
}

function clockNow() {
  return new Date().toTimeString().slice(0, 5)
}

function show(title: string, body: string) {
  if (typeof Notification === 'undefined') return
  const fire = () => new Notification(title, { body })
  if (Notification.permission === 'granted') {
    fire()
  } else if (Notification.permission !== 'denied') {
    void Notification.requestPermission().then((permission) => {
      if (permission === 'granted') fire()
    })
  }
}

/**
 * 前台检查：计划提醒与断档提醒各判断一次。
 * `gapDays` 由调用方用训练统计算好（从未训练传 -1）。
 */
export function maybeNotifyTraining(
  plan: TrainingPlan | undefined,
  trainedToday: boolean,
  gapDays: number,
): void {
  const today = todayKey()

  if (!trainedToday && localDay(NOTIFIED_KEY) !== today) {
    const normalized = normalizePlan(plan)
    if (
      normalized.enabled &&
      normalized.weeklyDays.length > 0 &&
      isPlanDay(normalized, today) &&
      isTimeReached(normalized, clockNow())
    ) {
      show(translate('training.plan.notifyTitle'), translate('training.plan.notifyBody'))
      markDay(NOTIFIED_KEY, today)
    }
  }

  if (localDay(NUDGE_KEY) !== today && shouldNudge(normalizePlan(plan), gapDays, false)) {
    show(
      translate('training.plan.nudgeTitle'),
      translate('training.plan.nudgeBody', { n: gapDays }),
    )
    markDay(NUDGE_KEY, today)
  }
}

/** 安卓：按周几排计划通知；关掉开关或没有周几时取消全部可能用过的 id */
export async function syncTrainingReminder(plan: TrainingPlan | undefined): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.requestPermissions()

    const normalized = normalizePlan(plan)
    const cancelAll = async () => {
      await LocalNotifications.cancel({
        notifications: ALL_IDS.map((id) => ({ id })),
      })
    }

    if (!normalized.enabled || normalized.weeklyDays.length === 0) {
      await cancelAll()
      return
    }

    const matched = normalized.time.match(/^(\d{1,2}):(\d{2})$/)
    const hour = matched ? Math.min(23, Number(matched[1])) : 20
    const minute = matched ? Math.min(59, Number(matched[2])) : 0

    // 先取消旧的再排新的：改计划后不会残留上一条
    await cancelAll()
    await LocalNotifications.schedule({
      notifications: normalized.weeklyDays.map((day, index) => ({
        id: PLAN_NOTIFICATION_BASE + index,
        title: translate('training.plan.notifyTitle'),
        body: translate('training.plan.notifyBody'),
        schedule: {
          every: 'week' as const,
          on: { weekday: notificationWeekday(day), hour, minute },
        },
      })),
    })
  } catch {
    // 插件不可用（浏览器 / 模拟器）就静默：前台检查还在
  }
}
