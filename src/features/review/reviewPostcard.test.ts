import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/core/db/schema'
import type { MonthSummary, ScheduleProgress } from './reviewMath'
import { reviewPostcardFacts } from './reviewPostcard'

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join('/')}` : key
const money = (value: number) => `¥${value}`

function schedule(doneDays: string[] = []): ScheduleItem {
  return {
    id: 'task-1',
    code: '123abcd',
    dateKey: '2026-11-01',
    endDate: '2026-11-30',
    time: '',
    title: 'Read',
    note: '',
    repeat: 'daily',
    weeklyDays: [],
    remind: false,
    doneAt: null,
    doneDays,
    checkIns: [],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }
}

const summary: MonthSummary = {
  daysWithRecords: 8,
  entries: 3,
  stamps: 2,
  intakes: 9,
  sleeps: 5,
  trainings: 2,
  weighIns: 1,
  financeRecords: 4,
  expense: 120,
  income: 30,
  balance: -90,
  sleepMinutes: 2400,
  sleepNights: 5,
  trainingSessions: 2,
  trainingMinutes: 90,
}

describe('reviewPostcardFacts', () => {
  it('keeps sleep and finance hidden until the user selects them', () => {
    const rows: ScheduleProgress[] = [{ item: schedule(['2026-11-01', '2026-11-03']), total: 30, done: 2, streak: 0 }]
    const facts = reviewPostcardFacts(summary, rows, '2026-11', '2026-11-03', t, money)
    expect(facts.find(({ id }) => id === 'sleep')).toMatchObject({ optional: true, includedByDefault: false })
    expect(facts.find(({ id }) => id === 'finance')).toMatchObject({ optional: true, includedByDefault: false })
    expect(facts.find(({ id }) => id === 'schedule')?.value).toBe('2/3')
    expect(facts.map(({ id }) => id)).not.toContain('intake')
    expect(facts.map(({ id }) => id)).not.toContain('weight')
  })

  it('omits empty optional fields and avoids future dates in the schedule total', () => {
    const empty = { ...summary, sleepNights: 0, sleepMinutes: 0, financeRecords: 0 }
    const rows: ScheduleProgress[] = [{ item: schedule(['2026-11-29']), total: 30, done: 1, streak: 0 }]
    const facts = reviewPostcardFacts(empty, rows, '2026-11', '2026-11-03', t, money)
    expect(facts.map(({ id }) => id)).not.toContain('sleep')
    expect(facts.map(({ id }) => id)).not.toContain('finance')
    expect(facts.find(({ id }) => id === 'schedule')?.value).toBe('0/3')
  })
})
