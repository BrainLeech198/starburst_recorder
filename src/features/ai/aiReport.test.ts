import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import type { DiaryEntry, HealthIntake, ScheduleItem } from '@/core/db/schema'
import { emptyProfile } from '@/features/health/healthMath'
import {
  buildReportUserPrompt,
  reportRangeForDate,
  reportTotals,
  reportTrendPoints,
} from './aiReport'

function emptyData(): BackupData {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
    measurements: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    sleeps: [],
    trainings: [],
    finance: [],
    schedules: [],
  }
}

function entry(patch: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: 'e1',
    code: 'e000001',
    dateKey: '2026-11-02',
    createdAt: 1,
    updatedAt: 1,
    content: '',
    images: [],
    tags: [],
    deletedAt: null,
    ...patch,
  }
}

function schedule(patch: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
    code: 'c000001',
    dateKey: '2026-11-01',
    time: '09:00',
    title: '练腿',
    note: '',
    repeat: 'daily',
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

function intake(patch: Partial<HealthIntake>): HealthIntake {
  return {
    id: 'i1',
    code: 'i000001',
    dateKey: '2026-11-02',
    time: '12:00',
    foodId: null,
    name: '午饭',
    grams: 0,
    kcal: 600,
    protein: 30,
    carbs: 60,
    fat: 20,
    source: 'manual',
    mealId: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...patch,
  }
}

const PERIOD = { kind: 'week' as const, from: '2026-11-02', to: '2026-11-08', label: '11/02 – 11/08' }
const DAY = { kind: 'day' as const, from: '2026-11-02', to: '2026-11-02', label: '11/02' }
const YEAR = { kind: 'year' as const, from: '2026-01-01', to: '2026-12-31', label: '2026' }
const MONTH = { kind: 'month' as const, from: '2026-11-01', to: '2026-11-30', label: '2026-11' }
const LEAP_YEAR = { kind: 'year' as const, from: '2024-01-01', to: '2024-12-31', label: '2024' }

describe('reportTotals', () => {
  it('只统计区间内的记录', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'a', dateKey: '2026-11-02', content: '区间内' }),
      entry({ id: 'b', dateKey: '2026-11-09', content: '区间外' }),
    ]
    data.finance = [
      {
        id: 'f1',
        code: 'f000001',
        dateKey: '2026-11-03',
        time: '12:00:00',
        kind: 'expense',
        category: '',
        name: '午饭',
        amount: 25,
        photo: null,
        note: '',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ]

    const totals = reportTotals(data, PERIOD)
    expect(totals.days).toBe(2)
    expect(totals.entries).toBe(1)
    expect(totals.expense).toBe(25)
  })

  it('日程按七天逐次统计完成情况', () => {
    const data = emptyData()
    data.schedules = [schedule({ doneDays: ['2026-11-02', '2026-11-03'] })]
    const totals = reportTotals(data, PERIOD)
    expect(totals.scheduleTotal).toBe(7)
    expect(totals.scheduleDone).toBe(2)
  })
})

describe('reportRangeForDate', () => {
  it('日报使用所选日，周报使用所选日期所在的周一至周日', () => {
    expect(reportRangeForDate('day', '2026-11-13')).toEqual({
      from: '2026-11-13',
      to: '2026-11-13',
    })
    expect(reportRangeForDate('week', '2026-11-13')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    })
  })
})

describe('buildReportUserPrompt', () => {
  it('只把区间内的内容写进提示词', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'a', dateKey: '2026-11-02', content: '和朋友吃了火锅' }),
      entry({ id: 'b', dateKey: '2026-11-09', content: '区间外的一件事' }),
    ]
    const prompt = buildReportUserPrompt(data, PERIOD)
    expect(prompt).toContain('和朋友吃了火锅')
    expect(prompt).not.toContain('区间外的一件事')
  })

  it('区间内没有记录时明确写出来，而不是留空', () => {
    const prompt = buildReportUserPrompt(emptyData(), PERIOD)
    expect(prompt).toContain('（这段时间没有可用的记录）')
  })

  it('日程会带上完成状态', () => {
    const data = emptyData()
    data.schedules = [schedule({ doneDays: ['2026-11-02'] })]
    const prompt = buildReportUserPrompt(data, PERIOD)
    expect(prompt).toContain('练腿（已完成）')
    expect(prompt).toContain('练腿（未完成）')
  })

  it('总量包含营养、训练时长与体重序列', () => {
    const data = emptyData()
    data.profile = {
      ...emptyProfile(),
      tdee: 2350,
      targetKcal: 2050,
      proteinTarget: 100,
      weighIns: [
        { dateKey: '2026-11-02', weightKg: 63.6, createdAt: 1 },
        { dateKey: '2026-11-08', weightKg: 63.1, createdAt: 2 },
      ],
    }
    data.intakes = [intake({}), intake({ id: 'i2', time: '08:00', kcal: 400, protein: 20 })]

    const totals = reportTotals(data, PERIOD)
    expect(totals.kcal).toBe(1000)
    expect(totals.protein).toBe(50)
    expect(totals.weights).toHaveLength(2)
    expect(totals.mealBuckets).toEqual({ breakfast: 1, lunch: 1, dinner: 0, other: 0 })
    expect(totals.mealKcalBuckets).toEqual({ breakfast: 400, lunch: 600, dinner: 0, other: 0 })
    expect(totals.intakeDays).toBe(1)
    expect(totals.firstMeal).toBe('08:00')
    expect(totals.lastMeal).toBe('12:00')
    expect(totals.proteinSources[0]).toEqual({ name: '午饭', protein: 50 })
    expect(totals.foodSources[0]).toEqual({ name: '午饭', kcal: 1000 })

    const prompt = buildReportUserPrompt(data, PERIOD)
    expect(prompt).toContain('目标线：维持 2350 千卡 / 目标 2050 千卡 / 蛋白目标 100 g')
    expect(prompt).toContain('体重序列：11-02 63.6 → 11-08 63.1（变化 -0.5 kg）')
    expect(prompt).toContain('进食窗 08:00–12:00')
    expect(prompt).toContain('餐次：早 1 笔/400 千卡、午 1 笔/600 千卡')
    expect(prompt).toContain('供能比：蛋白')
    expect(prompt).toContain('蛋白来源（按克数）：午饭 50 g')
    expect(prompt).toContain('热量来源（按千卡）：午饭 1000')
  })

  it('上周有记录时给出对比块，没有时明说跳过', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'a', dateKey: '2026-11-02', content: '本周的事' }),
      entry({ id: 'b', dateKey: '2026-10-28', content: '上周写的一篇' }),
    ]
    const prompt = buildReportUserPrompt(data, PERIOD)
    expect(prompt).toContain('— 上周总量（对比用）—')
    // 对比块只给总量，不把上周正文塞进逐日素材
    expect(prompt).not.toContain('上周写的一篇')

    const alone = buildReportUserPrompt(emptyData(), PERIOD)
    expect(alone).toContain('上周：没有可用记录')
  })

  it('日报带上近 7 天趋势，且不混入区间外正文', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'a', dateKey: '2026-11-02', content: '今天写的事' }),
      entry({ id: 'b', dateKey: '2026-10-31', content: '三天前写的事' }),
    ]
    const prompt = buildReportUserPrompt(data, DAY)
    expect(prompt).toContain('报告类型：日报')
    expect(prompt).toContain('— 截至所选日期的近 7 天趋势 —')
    expect(prompt).toContain('今天写的事')
    // 近 7 天只出总量，不把每天的正文重复塞一遍
    expect(prompt).not.toContain('三天前写的事')
  })

  it('年报按月汇总，不逐日展开', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'a', dateKey: '2026-03-02', content: '三月的一篇日记' }),
      entry({ id: 'b', dateKey: '2026-08-09', content: '八月的一篇日记' }),
    ]
    const prompt = buildReportUserPrompt(data, YEAR)
    expect(prompt).toContain('报告类型：年报')
    expect(prompt).toContain('— 逐月总量 —')
    expect(prompt).toContain('3 月：')
    expect(prompt).toContain('8 月：')
    expect(prompt).not.toContain('三月的一篇日记')
    expect(prompt).not.toContain('每天的记录')
  })

  it('月报对比完整的上一个日历月', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'oct-first', dateKey: '2026-10-01', content: '上月第一天' }),
      entry({ id: 'oct-last', dateKey: '2026-10-31', content: '上月最后一天' }),
      entry({ id: 'sep-last', dateKey: '2026-09-30', content: '上上月最后一天' }),
      entry({ id: 'nov', dateKey: '2026-11-15', content: '本月记录' }),
    ]

    const prompt = buildReportUserPrompt(data, MONTH)
    const previous = prompt.split('— 上月总量（对比用）—')[1] ?? ''
    expect(previous).toContain('日记 2 篇')
    expect(previous).not.toContain('日记 3 篇')
  })

  it('闰年年报对比完整的上一年', () => {
    const data = emptyData()
    data.entries = [
      entry({ id: 'prior-first', dateKey: '2023-01-01', content: '去年第一天' }),
      entry({ id: 'prior-last', dateKey: '2023-12-31', content: '去年最后一天' }),
      entry({ id: 'older-last', dateKey: '2022-12-31', content: '前年最后一天' }),
      entry({ id: 'current', dateKey: '2024-01-01', content: '今年记录' }),
    ]

    const prompt = buildReportUserPrompt(data, LEAP_YEAR)
    const previous = prompt.split('— 去年总量（对比用）—')[1] ?? ''
    expect(previous).toContain('日记 2 篇')
    expect(previous).not.toContain('日记 3 篇')
  })

  it('年报逐月摄入日均只按有摄入的天数计算', () => {
    const data = emptyData()
    data.intakes = [
      intake({ id: 'i1', dateKey: '2026-01-01', kcal: 600 }),
      intake({ id: 'i2', dateKey: '2026-01-01', time: '18:00', kcal: 400 }),
    ]
    data.entries = [
      entry({ id: 'd2', dateKey: '2026-01-02' }),
      entry({ id: 'd3', dateKey: '2026-01-03' }),
      entry({ id: 'd4', dateKey: '2026-01-04' }),
    ]

    const prompt = buildReportUserPrompt(data, YEAR)
    expect(prompt).toContain('1 月：记录 4 天；摄入日均 1000 千卡')
  })

  it('历史日报趋势截至所选日期，且只覆盖之前六天', () => {
    const data = emptyData()
    data.intakes = [
      intake({ id: 'outside', dateKey: '2026-11-06', kcal: 999 }),
      intake({ id: 'first', dateKey: '2026-11-07', kcal: 100, protein: 5 }),
      intake({ id: 'selected', dateKey: '2026-11-13', kcal: 500, protein: 25 }),
      intake({ id: 'deleted', dateKey: '2026-11-13', kcal: 1000, deletedAt: 1 }),
    ]

    const points = reportTrendPoints(data, {
      kind: 'day',
      from: '2026-11-13',
      to: '2026-11-13',
      label: '2026-11-13',
    })
    expect(points).toHaveLength(7)
    expect(points[0]).toMatchObject({ key: '2026-11-07', kcal: 100, protein: 5 })
    expect(points[6]).toMatchObject({ key: '2026-11-13', kcal: 500, protein: 25 })
  })
})
