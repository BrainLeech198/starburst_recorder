import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import type { DiaryEntry, HealthIntake, ScheduleItem } from '@/core/db/schema'
import { emptyProfile } from '@/features/health/healthMath'
import { buildReportUserPrompt, reportTotals } from './aiReport'

function emptyData(): BackupData {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
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

const PERIOD = { kind: 'week' as const, from: '2026-11-02', to: '2026-11-08', label: '11/02 – 11/08' }

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
    const intake = (patch: Partial<HealthIntake>): HealthIntake => ({
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
    })
    data.intakes = [intake({}), intake({ id: 'i2', time: '08:00', kcal: 400, protein: 20 })]

    const totals = reportTotals(data, PERIOD)
    expect(totals.kcal).toBe(1000)
    expect(totals.protein).toBe(50)
    expect(totals.weights).toHaveLength(2)

    const prompt = buildReportUserPrompt(data, PERIOD)
    expect(prompt).toContain('目标线：维持 2350 千卡 / 目标 2050 千卡 / 蛋白目标 100 g')
    expect(prompt).toContain('体重序列：11-02 63.6 → 11-08 63.1（变化 -0.5 kg）')
    expect(prompt).toContain('进食窗 08:00–12:00')
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
})
