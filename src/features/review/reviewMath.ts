/**
 * 月度回顾的纯计算：把一个月的记录压成几句能看的数字。
 *
 * 只做汇总，不读存储：页面把 activityBetween / financeOfMonth /
 * sleepsBetween / trainingsBetween 的结果交进来，这里负责算平均与合计，
 * 「完成率」和「连续完成」也只认日程数据，不碰通知。
 */
import type { DayActivity } from '@/core/db/store'
import type { FinanceEntry, HealthSleep, HealthTraining, ScheduleItem } from '@/core/db/schema'
import { sleepMinutes } from '@/features/health/sleepMath'
import { summarizeFinance } from '@/features/finance/financeMath'
import { dateKeysOfMonth, isDoneOn, occursOn } from '@/features/schedule/scheduleMath'

export interface MonthSummary {
  /** 有记录的天数（含日程以外任意一块） */
  daysWithRecords: number
  entries: number
  stamps: number
  intakes: number
  sleeps: number
  trainings: number
  weighIns: number
  financeRecords: number
  expense: number
  income: number
  balance: number
  /** 夜间睡眠合计分钟；没有睡眠记录时为 0 */
  sleepMinutes: number
  sleepNights: number
  trainingSessions: number
  trainingMinutes: number
}

/** 某个月的汇总：活动条数来自按天计数，收支 / 睡眠 / 训练来自各自的月度记录 */
export function summarizeMonth(input: {
  activities: DayActivity[]
  finance: FinanceEntry[]
  sleeps: HealthSleep[]
  trainings: HealthTraining[]
}): MonthSummary {
  const summary: MonthSummary = {
    daysWithRecords: 0,
    entries: 0,
    stamps: 0,
    intakes: 0,
    sleeps: 0,
    trainings: 0,
    weighIns: 0,
    financeRecords: 0,
    expense: 0,
    income: 0,
    balance: 0,
    sleepMinutes: 0,
    sleepNights: 0,
    trainingSessions: 0,
    trainingMinutes: 0,
  }

  for (const day of input.activities) {
    const records =
      day.entries + day.stamps + day.intakes + day.sleeps + day.trainings + day.finance + day.weighIns
    if (records > 0) summary.daysWithRecords += 1
    summary.entries += day.entries
    summary.stamps += day.stamps
    summary.intakes += day.intakes
    summary.sleeps += day.sleeps
    summary.trainings += day.trainings
    summary.weighIns += day.weighIns
    summary.financeRecords += day.finance
  }

  const money = summarizeFinance(input.finance)
  summary.expense = money.expense
  summary.income = money.income
  summary.balance = money.balance

  for (const sleep of input.sleeps) {
    if (sleep.deletedAt !== null) continue
    summary.sleepNights += 1
    summary.sleepMinutes += sleepMinutes(sleep.bedtime, sleep.wakeTime)
  }

  for (const training of input.trainings) {
    if (training.deletedAt !== null) continue
    summary.trainingSessions += 1
    summary.trainingMinutes += training.durationMin ?? 0
  }

  return summary
}

/** 平均每夜睡多久；没有记录时返回 null，页面显示「—」 */
export function averageSleepMinutes(summary: MonthSummary): number | null {
  if (summary.sleepNights === 0) return null
  return Math.round(summary.sleepMinutes / summary.sleepNights)
}

export interface ScheduleProgress {
  item: ScheduleItem
  /** 这个月它应该出现几次 */
  total: number
  /** 其中做完了几次 */
  done: number
  /** 从最近一次应做的那天往回数，连续做完了几次 */
  streak: number
}

/**
 * 某个月的日程完成情况。
 *
 * 一次性日程只看它那一天；定期任务按「这个月出现了几次」算。
 * 连续次数只数到今天为止：未来还没到的日子不该把连续打断。
 */
export function scheduleProgress(
  items: ScheduleItem[],
  monthKey: string,
  today: string,
): ScheduleProgress[] {
  const days = dateKeysOfMonth(monthKey)
  return items
    .map((item) => {
      const dates = days.filter((date) => occursOn(item, date))
      const done = dates.filter((date) => isDoneOn(item, date)).length
      const past = dates.filter((date) => date <= today)
      let streak = 0
      for (let index = past.length - 1; index >= 0; index -= 1) {
        if (!isDoneOn(item, past[index])) break
        streak += 1
      }
      return { item, total: dates.length, done, streak }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.item.title.localeCompare(b.item.title))
}

/** 一天的记录总数，回顾页的每日小条用它决定深浅 */
export function recordCountOf(day: DayActivity | undefined): number {
  if (!day) return 0
  return day.entries + day.stamps + day.intakes + day.sleeps + day.trainings + day.finance + day.weighIns
}
