import { describe, expect, it } from 'vitest'
import type {
  DiaryDay,
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
} from '@/core/db/schema'
import type { BackupData } from '@/core/db/store'
import {
  HISTORY_BUDGET,
  buildComposeUserPrompt,
  buildHistoryBlock,
  buildHistoryDays,
  buildStyleSamples,
} from './aiCompose'

function entry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'e1',
    code: 'a000001',
    dateKey: '2026-10-25',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    content: '昨天去复查了。',
    images: [],
    deletedAt: null,
    ...overrides,
  }
}

function stamp(overrides: Partial<DiaryStamp> = {}): DiaryStamp {
  return {
    id: 's1',
    code: 'c000001',
    dateKey: '2026-10-25',
    time: '09:30',
    content: '排队排了很久。',
    images: [],
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function intake(overrides: Partial<HealthIntake> = {}): HealthIntake {
  return {
    id: 'i1',
    code: 'b000001',
    dateKey: '2026-10-26',
    time: '12:10',
    foodId: null,
    name: '米饭',
    grams: 350,
    kcal: 420,
    protein: 8,
    carbs: 90,
    fat: 2,
    source: 'manual',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function finance(overrides: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: 'f1',
    code: 'f000001',
    dateKey: '2026-10-26',
    kind: 'expense',
    category: 'food',
    name: '午饭',
    amount: 25,
    note: '食堂',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function day(overrides: Partial<DiaryDay> = {}): DiaryDay {
  return { dateKey: '2026-10-25', weather: '晴', updatedAt: 1790000000000, ...overrides }
}

function backup(overrides: Partial<BackupData> = {}): BackupData {
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
    finance: [],
    ...overrides,
  }
}

describe('buildHistoryDays', () => {
  it('排除目标日期，只留选区内的未删除记录，并按日期倒序', () => {
    const data = backup({
      entries: [
        entry({ id: 'e1', dateKey: '2026-10-20', content: '二十号' }),
        entry({ id: 'e2', dateKey: '2026-10-25', content: '二十五号' }),
        entry({ id: 'e3', dateKey: '2026-10-26', content: '目标日' }),
        entry({ id: 'e4', dateKey: '2026-10-24', content: '删掉的', deletedAt: 1 }),
        entry({ id: 'e5', dateKey: '2026-10-01', content: '区间外' }),
      ],
    })
    const days = buildHistoryDays(data, '2026-10-20', '2026-10-26', '2026-10-26')
    expect(days.map((item) => item.dateKey)).toEqual(['2026-10-25', '2026-10-20'])
  })

  it('按天聚合随记、摄入、收支和天气，空日子不占位', () => {
    const data = backup({
      stamps: [stamp({ dateKey: '2026-10-25' })],
      intakes: [intake({ dateKey: '2026-10-25' })],
      finance: [finance({ dateKey: '2026-10-25' })],
      days: [day({ dateKey: '2026-10-25' })],
    })
    const [only] = buildHistoryDays(data, '2026-10-24', '2026-10-25', '2026-10-26')
    expect(only).toMatchObject({
      dateKey: '2026-10-25',
      weather: '晴',
      stamps: [expect.objectContaining({ content: '排队排了很久。' })],
      intakes: [expect.objectContaining({ name: '米饭' })],
      finance: [expect.objectContaining({ name: '午饭' })],
    })
  })
})

describe('buildStyleSamples', () => {
  it('取最近的几篇日记正文，跳过软删除和空正文', () => {
    const samples = buildStyleSamples([
      entry({ id: 'a', dateKey: '2026-10-20', content: '旧的一篇' }),
      entry({ id: 'b', dateKey: '2026-10-25', content: '新的一篇' }),
      entry({ id: 'c', dateKey: '2026-10-26', content: '删掉的一篇', deletedAt: 1 }),
      entry({ id: 'd', dateKey: '2026-10-27', content: '   ' }),
    ])
    expect(samples).toEqual(['新的一篇', '旧的一篇'])
  })
})

describe('buildComposeUserPrompt', () => {
  const today = {
    weather: '晴',
    stamps: [stamp({ dateKey: '2026-10-26', time: '08:30', content: '早起跑步。' })],
    intakes: [intake()],
    sleep: null,
    finance: [finance()],
  }

  it('只写选中的资料来源', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today,
      sources: ['stamps'],
      history: [],
      styleSamples: [],
    })
    expect(content).toContain('今天的随记')
    expect(content).toContain('08:30 早起跑步。')
    expect(content).not.toContain('今天的饮食摄入')
    expect(content).not.toContain('今天的收支')
  })

  it('选中健康与经济时，带上热量和金额', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today,
      sources: ['health', 'finance'],
      history: [],
      styleSamples: [],
    })
    expect(content).toContain('12:10 米饭 350g 420 千卡')
    expect(content).toContain('午饭 25 元（食堂）')
  })

  it('没有天气就不写天气行', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today: { ...today, weather: null },
      sources: ['stamps'],
      history: [],
      styleSamples: [],
    })
    expect(content).not.toContain('天气：')
  })

  it('历史单独成段，并标明旧记录', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today,
      sources: ['stamps'],
      history: [
        {
          dateKey: '2026-10-25',
          weather: '阴',
          entries: [entry()],
          stamps: [stamp()],
          intakes: [],
          sleep: null,
          finance: [],
        },
      ],
      styleSamples: [],
    })
    expect(content).toContain('旧记录')
    expect(content).toContain('2026年10月25日')
    expect(content).toContain('昨天去复查了。')
    expect(content).toContain('不是今天发生的事')
  })

  it('历史里也不提没勾选的来源', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today,
      sources: ['stamps'],
      history: [
        {
          dateKey: '2026-10-25',
          weather: null,
          entries: [],
          stamps: [],
          intakes: [intake({ dateKey: '2026-10-25' })],
          sleep: null,
          finance: [finance({ dateKey: '2026-10-25' })],
        },
      ],
      styleSamples: [],
    })
    expect(content).not.toContain('摄入：合计')
    expect(content).not.toContain('收支：午饭')
  })

  it('有文风样例时附在最后', () => {
    const content = buildComposeUserPrompt({
      dateKey: '2026-10-26',
      today,
      sources: ['stamps'],
      history: [],
      styleSamples: ['我写东西喜欢短句。'],
    })
    expect(content).toContain('文风参考')
    expect(content).toContain('我写东西喜欢短句。')
  })
})

describe('buildHistoryBlock', () => {
  it('超出预算时丢掉更旧的记录', () => {
    const days = Array.from({ length: 20 }, (_, index) => {
      const dateKey = `2026-10-${String(20 - index).padStart(2, '0')}`
      return {
        dateKey,
        weather: null,
        entries: [entry({ dateKey, content: `第${index}天`.repeat(200) })],
        stamps: [],
        intakes: [],
        sleep: null,
        finance: [],
      }
    })
    const block = buildHistoryBlock(days)
    expect(block.length).toBeLessThanOrEqual(HISTORY_BUDGET + 200)
    expect(block).toContain('第0天')
    expect(block).not.toContain('第19天')
  })
})
