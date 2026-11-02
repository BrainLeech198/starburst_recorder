import { describe, expect, it } from 'vitest'
import type { DayActivity } from '@/core/db/store'
import type { FinanceEntry, HealthSleep, HealthTraining, ScheduleItem } from '@/core/db/schema'
import {
  averageSleepMinutes,
  recordCountOf,
  scheduleProgress,
  summarizeMonth,
} from './reviewMath'

function activity(patch: Partial<DayActivity> = {}): DayActivity {
  return {
    dateKey: '2026-11-01',
    entries: 0,
    stamps: 0,
    intakes: 0,
    sleeps: 0,
    trainings: 0,
    finance: 0,
    weighIns: 0,
    ...patch,
  }
}

function finance(amount: number, kind: 'expense' | 'income'): FinanceEntry {
  return {
    id: `f${Math.random()}`,
    code: 'f000001',
    dateKey: '2026-11-02',
    time: '12:00:00',
    kind,
    category: '',
    name: '测试',
    amount,
    photo: null,
    note: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }
}

function sleep(bedtime: string, wakeTime: string): HealthSleep {
  return {
    id: 'sl1',
    code: 's000001',
    dateKey: '2026-11-02',
    bedtime,
    wakeTime,
    quality: null,
    wakeEvents: [],
    naps: [],
    wakeCount: null,
    wakeMinutes: null,
    note: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }
}

function training(minutes: number | null): HealthTraining {
  return {
    id: 't1',
    code: 't000001',
    dateKey: '2026-11-02',
    time: '19:00',
    kind: 'strength',
    title: '',
    exercises: [],
    durationMin: minutes,
    feeling: null,
    note: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }
}

function schedule(patch: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
    code: 'c000001',
    dateKey: '2026-11-01',
    time: '09:00',
    title: '任务',
    note: '',
    repeat: 'none',
    weeklyDays: [],
    remind: false,
    doneAt: null,
    doneDays: [],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...patch,
  }
}

describe('summarizeMonth', () => {
  it('记录条数、收支、睡眠与训练都汇总到一起', () => {
    const summary = summarizeMonth({
      activities: [
        activity({ dateKey: '2026-11-01', entries: 2, stamps: 1 }),
        activity({ dateKey: '2026-11-02', intakes: 3, sleeps: 1, trainings: 1, finance: 2, weighIns: 1 }),
      ],
      finance: [finance(30, 'expense'), finance(100, 'income')],
      sleeps: [sleep('23:00', '07:00')],
      trainings: [training(45)],
    })

    expect(summary.daysWithRecords).toBe(2)
    expect(summary.entries).toBe(2)
    expect(summary.financeRecords).toBe(2)
    expect(summary.expense).toBe(30)
    expect(summary.income).toBe(100)
    expect(summary.balance).toBe(70)
    expect(summary.sleepMinutes).toBe(480)
    expect(summary.sleepNights).toBe(1)
    expect(summary.trainingSessions).toBe(1)
    expect(summary.trainingMinutes).toBe(45)
  })

  it('没有记录的日子不算进记录天数', () => {
    const summary = summarizeMonth({
      activities: [activity({ dateKey: '2026-11-01' })],
      finance: [],
      sleeps: [],
      trainings: [],
    })
    expect(summary.daysWithRecords).toBe(0)
  })
})

describe('averageSleepMinutes', () => {
  it('没有睡眠记录时返回 null', () => {
    const summary = summarizeMonth({ activities: [], finance: [], sleeps: [], trainings: [] })
    expect(averageSleepMinutes(summary)).toBeNull()
  })

  it('按夜数取平均并四舍五入', () => {
    const summary = summarizeMonth({
      activities: [],
      finance: [],
      sleeps: [sleep('23:00', '07:00'), sleep('23:30', '07:00')],
      trainings: [],
    })
    expect(averageSleepMinutes(summary)).toBe(465)
  })
})

describe('scheduleProgress', () => {
  it('每天的定期任务按整月出现次数算', () => {
    const row = schedule({ repeat: 'daily', doneDays: ['2026-11-08', '2026-11-09', '2026-11-10'] })
    const [progress] = scheduleProgress([row], '2026-11', '2026-11-10')
    expect(progress.total).toBe(30)
    expect(progress.done).toBe(3)
    expect(progress.streak).toBe(3)
  })

  it('连续次数在第一次没做的地方中断', () => {
    const row = schedule({ repeat: 'daily', doneDays: ['2026-11-06', '2026-11-07', '2026-11-09'] })
    const [progress] = scheduleProgress([row], '2026-11', '2026-11-09')
    expect(progress.streak).toBe(1)
  })

  it('每周任务只数命中的那几天', () => {
    const row = schedule({ repeat: 'weekly', weeklyDays: [1], doneDays: ['2026-11-02', '2026-11-09'] })
    const [progress] = scheduleProgress([row], '2026-11', '2026-11-10')
    expect(progress.total).toBe(5)
    expect(progress.done).toBe(2)
    expect(progress.streak).toBe(2)
  })

  it('未来的日子不会把连续打断', () => {
    const row = schedule({ repeat: 'daily', doneDays: ['2026-11-09', '2026-11-10'] })
    const [progress] = scheduleProgress([row], '2026-11', '2026-11-10')
    expect(progress.streak).toBe(2)
  })

  it('一次性日程也算一条，并把上个月之外的过滤掉', () => {
    const rows = [
      schedule({ id: 'a', dateKey: '2026-11-05' }),
      schedule({ id: 'b', dateKey: '2026-10-05' }),
    ]
    const progress = scheduleProgress(rows, '2026-11', '2026-11-30')
    expect(progress).toHaveLength(1)
    expect(progress[0].total).toBe(1)
  })
})

describe('recordCountOf', () => {
  it('没有那一天就是 0', () => {
    expect(recordCountOf(undefined)).toBe(0)
  })

  it('把各类记录加起来', () => {
    expect(recordCountOf(activity({ entries: 1, stamps: 2, finance: 3 }))).toBe(6)
  })
})
