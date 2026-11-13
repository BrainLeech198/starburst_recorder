import { describe, expect, it } from 'vitest'
import { daysBetween } from './trainingMath'
import {
  DEFAULT_TRAINING_PLAN,
  isPlanDay,
  notificationWeekday,
  normalizePlan,
  shouldNudge,
  shouldRemindPlan,
} from './trainingPlan'

const plan = { ...DEFAULT_TRAINING_PLAN, enabled: true, weeklyDays: [1, 3, 5], time: '20:00' }

describe('计划提醒', () => {
  it('周几命中才算数', () => {
    expect(isPlanDay(plan, '2026-11-02')).toBe(true) // 周一
    expect(isPlanDay(plan, '2026-11-03')).toBe(false) // 周二
    expect(isPlanDay(plan, '2026-11-06')).toBe(true) // 周五
  })

  it('到点、周几命中、今天没练、没提醒过才发', () => {
    const base = {
      plan,
      dateKey: '2026-11-02',
      clock: '20:05',
      trainedToday: false,
      notifiedToday: false,
    }
    expect(shouldRemindPlan(base)).toBe(true)
    expect(shouldRemindPlan({ ...base, clock: '19:59' })).toBe(false)
    expect(shouldRemindPlan({ ...base, trainedToday: true })).toBe(false)
    expect(shouldRemindPlan({ ...base, notifiedToday: true })).toBe(false)
    expect(shouldRemindPlan({ ...base, dateKey: '2026-11-03' })).toBe(false)
    expect(shouldRemindPlan({ ...base, plan: { ...plan, enabled: false } })).toBe(false)
  })
})

describe('断档提醒', () => {
  it('达到天数才提醒，当天只提醒一次', () => {
    expect(shouldNudge(plan, 2, false)).toBe(false)
    expect(shouldNudge(plan, 3, false)).toBe(true)
    expect(shouldNudge(plan, 3, true)).toBe(false)
  })

  it('nudgeAfterDays = 0 表示关闭', () => {
    expect(shouldNudge({ ...plan, nudgeAfterDays: 0 }, 30, false)).toBe(false)
  })

  it('跨月断档按日历天数算', () => {
    const gap = daysBetween('2026-10-30', '2026-11-02')
    expect(gap).toBe(3)
    expect(shouldNudge(plan, gap, false)).toBe(true)
  })
})

describe('设置兜底', () => {
  it('规范化提醒计划时保留已备份的模板', () => {
    const template = {
      id: 't1', name: '推日', kind: 'strength' as const, title: '推', durationMin: null,
      exercises: [{
        id: 'e1', name: '俯卧撑', kind: 'strength' as const, muscle: 'chest',
        sets: [], durationMin: null, distanceKm: null, note: '',
      }],
    }
    expect(normalizePlan({ ...plan, templates: [template] }).templates).toEqual([template])
    expect(normalizePlan(undefined).templates).toEqual([])
  })
  it('旧档案没有计划时给默认值', () => {
    expect(normalizePlan(undefined)).toEqual(DEFAULT_TRAINING_PLAN)
  })

  it('坏的周几与时刻被清掉', () => {
    expect(
      normalizePlan({ enabled: true, weeklyDays: [0, 1, 8, 1], time: '25:00', nudgeAfterDays: 99 }),
    ).toEqual({ enabled: true, weeklyDays: [1], time: '20:00', nudgeAfterDays: 3, templates: [] })
  })

  it('Capacitor 的 weekday 从周日算起', () => {
    expect(notificationWeekday(1)).toBe(2)
    expect(notificationWeekday(6)).toBe(7)
    expect(notificationWeekday(7)).toBe(1)
  })
})
