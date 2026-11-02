/**
 * 全局搜索的匹配规则。
 *
 * 盯的是「用户明明记过却搜不出来」这一类问题：覆盖到哪几张表、
 * 收支分类怎么对、`#标签` 该不该把「工作台」也带出来。
 * 桌面端那份 SQLite 实现的同语义由 `src/core/db/desktopSearch.test.ts` 比对。
 */
import { describe, expect, it } from 'vitest'
import type {
  DiaryEntry,
  DiaryPreset,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthSleep,
  HealthTraining,
  ScheduleItem,
} from '@/core/db/schema'
import type { SearchInput } from './match'
import { searchRows } from './match'

const T = 1_700_000_000_000

function entry(over: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'e1',
    code: 'E000001',
    dateKey: '2026-10-01',
    createdAt: T,
    updatedAt: T,
    content: '',
    images: [],
    tags: [],
    deletedAt: null,
    ...over,
  }
}

function stamp(over: Partial<DiaryStamp> = {}): DiaryStamp {
  return {
    id: 's1',
    code: 'S000001',
    dateKey: '2026-10-01',
    time: '08:00',
    content: '',
    images: [],
    tags: [],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function finance(over: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: 'f1',
    code: 'N000001',
    dateKey: '2026-10-01',
    time: '12:00:00',
    kind: 'expense',
    category: '',
    name: '',
    amount: 10,
    photo: null,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function sleep(over: Partial<HealthSleep> = {}): HealthSleep {
  return {
    id: 'sl1',
    code: 'L000001',
    dateKey: '2026-10-01',
    bedtime: '23:00',
    wakeTime: '07:00',
    quality: null,
    wakeEvents: [],
    naps: [],
    wakeCount: null,
    wakeMinutes: null,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function intake(over: Partial<HealthIntake> = {}): HealthIntake {
  return {
    id: 'i1',
    code: 'I000001',
    dateKey: '2026-10-01',
    time: '12:00',
    foodId: null,
    name: '',
    grams: 100,
    kcal: 100,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: 'manual',
    mealId: null,
    components: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function food(over: Partial<HealthFood> = {}): HealthFood {
  return {
    id: 'fd1',
    code: 'D000001',
    name: '',
    kcal: 100,
    protein: 0,
    carbs: 0,
    fat: 0,
    servingName: null,
    servingGrams: null,
    photo: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function meal(over: Partial<HealthMeal> = {}): HealthMeal {
  return {
    id: 'm1',
    name: '',
    items: [],
    photo: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function training(over: Partial<HealthTraining> = {}): HealthTraining {
  return {
    id: 't1',
    code: 'T000001',
    dateKey: '2026-10-01',
    time: '19:00',
    kind: 'strength',
    title: '',
    exercises: [],
    durationMin: null,
    feeling: null,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function schedule(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'c1',
    code: 'C000001',
    dateKey: '2026-10-01',
    time: '',
    title: '',
    note: '',
    repeat: 'none',
    weeklyDays: [],
    remind: false,
    doneAt: null,
    doneDays: [],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function preset(over: Partial<DiaryPreset> = {}): DiaryPreset {
  return {
    id: 'p1',
    code: 'P000001',
    kind: 'person',
    name: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...over,
  }
}

function input(over: Partial<SearchInput>): SearchInput {
  return {
    entries: [],
    stamps: [],
    finance: [],
    sleeps: [],
    intakes: [],
    foods: [],
    meals: [],
    trainings: [],
    schedules: [],
    presets: [],
    ...over,
  }
}

describe('searchRows 覆盖范围', () => {
  const rows = input({
    entries: [entry({ content: '今天吃了宫保鸡丁' })],
    stamps: [stamp({ content: '买了一半鸡腿' })],
    finance: [finance({ name: '鸡肉' })],
    sleeps: [sleep({ note: '睡前喝了鸡汤' })],
    intakes: [intake({ name: '鸡胸肉' })],
    trainings: [
      training({ exercises: [{ id: 'x', name: '俯卧撑', kind: 'strength', muscle: 'chest', sets: [], durationMin: null, distanceKm: null, note: '模拟鸡形' }] }),
    ],
    schedules: [schedule({ title: '买鸡' })],
    foods: [food({ name: '鸡腿' })],
    meals: [meal({ name: '白切鸡套餐' })],
    presets: [preset({ name: '小陈（养鸡的）' })],
  })

  it('十类记录都能搜到', () => {
    const hits = searchRows(rows, '鸡')
    expect(hits.entries.map((item) => item.id)).toEqual(['e1'])
    expect(hits.stamps.map((item) => item.id)).toEqual(['s1'])
    expect(hits.finance.map((item) => item.id)).toEqual(['f1'])
    expect(hits.sleeps.map((item) => item.id)).toEqual(['sl1'])
    expect(hits.intakes.map((item) => item.id)).toEqual(['i1'])
    expect(hits.trainings.map((item) => item.id)).toEqual(['t1'])
    expect(hits.schedules.map((item) => item.id)).toEqual(['c1'])
    expect(hits.foods.map((item) => item.id)).toEqual(['fd1'])
    expect(hits.meals.map((item) => item.id)).toEqual(['m1'])
    expect(hits.presets.map((item) => item.id)).toEqual(['p1'])
  })

  it('套餐摄入按成分名命中，训练按动作备注命中', () => {
    const hits = searchRows(
      input({
        intakes: [
          intake({
            id: 'i2',
            name: '沙县套餐',
            components: [{ foodId: null, name: '卤鸡腿', grams: 90, kcal: 180, protein: 20, carbs: 1, fat: 9 }],
          }),
        ],
      }),
      '鸡腿',
    )
    expect(hits.intakes.map((item) => item.id)).toEqual(['i2'])
  })

  it('回收站里的记录一律不算', () => {
    const hits = searchRows(
      input({
        entries: [entry({ content: '鸡' }), entry({ id: 'e2', code: 'E000002', content: '鸡', deletedAt: T + 1 })],
        foods: [food({ name: '鸡肉' }), food({ id: 'fd2', code: 'D000002', name: '鸡肉', deletedAt: T + 1 })],
      }),
      '鸡',
    )
    expect(hits.entries.map((item) => item.id)).toEqual(['e1'])
    expect(hits.foods.map((item) => item.id)).toEqual(['fd1'])
    expect(hits.tags).toEqual([])
  })
})

describe('searchRows 收支分类', () => {
  const rows = input({
    finance: [
      finance({ id: 'f1', category: 'food', name: '午饭' }),
      finance({ id: 'f2', category: 'salary', name: '十月工资', kind: 'income' }),
    ],
  })

  it('按调用方翻译好的分类 id 命中', () => {
    expect(searchRows(rows, '餐饮', ['food']).finance.map((item) => item.id)).toEqual(['f1'])
  })

  it('库里的分类 id 不再被当成正文匹配', () => {
    // 以前搜 food 会把分类为 food 的记录捞出来，用户在界面上看到的却是「餐饮」
    expect(searchRows(rows, 'food').finance).toEqual([])
  })

  it('正文命中不依赖分类', () => {
    expect(searchRows(rows, '工资').finance.map((item) => item.id)).toEqual(['f2'])
  })
})

describe('searchRows 标签', () => {
  const rows = input({
    entries: [entry({ id: 'e1', content: '', tags: ['工作'] }), entry({ id: 'e2', code: 'E000002', content: '', tags: ['工作台'] })],
  })

  it('#标签 是精确匹配，不带同前缀的标签', () => {
    expect(searchRows(rows, '#工作').entries.map((item) => item.id)).toEqual(['e1'])
  })

  it('#标签 忽略大小写', () => {
    const tagged = input({ entries: [entry({ content: '', tags: ['Work'] })] })
    expect(searchRows(tagged, '#work').entries.map((item) => item.id)).toEqual(['e1'])
  })

  it('普通关键词仍然按子串带上标签', () => {
    expect(searchRows(rows, '工作').entries.map((item) => item.id)).toEqual(['e1', 'e2'])
  })

  it('标签行只收日记和随记，按出现次数排', () => {
    const hits = searchRows(
      input({
        entries: [entry({ id: 'e1', tags: ['常用'] }), entry({ id: 'e2', code: 'E000002', tags: ['常用', '少见'] })],
        stamps: [stamp({ tags: ['常用'] })],
      }),
      '',
    )
    expect(hits.tags).toEqual(['常用', '少见'])
  })
})

describe('searchRows 关键词与排序', () => {
  it('空关键词只回标签，不回记录', () => {
    const hits = searchRows(input({ entries: [entry({ content: '任何内容' })] }), '   ')
    expect(hits.entries).toEqual([])
    expect(hits.tags).toEqual([])
  })

  it('光一个 # 等于没筛', () => {
    const hits = searchRows(input({ entries: [entry({ tags: ['工作'] })] }), '#')
    expect(hits.entries).toEqual([])
    expect(hits.tags).toEqual(['工作'])
  })

  it('忽略大小写', () => {
    const hits = searchRows(input({ presets: [preset({ name: 'Alice' })] }), 'ali')
    expect(hits.presets.map((item) => item.id)).toEqual(['p1'])
  })

  it('按日期倒序，同一天按时刻倒序', () => {
    const hits = searchRows(
      input({
        schedules: [
          schedule({ id: 'c1', dateKey: '2026-10-01', title: '鸡' }),
          schedule({ id: 'c2', code: 'C000002', dateKey: '2026-10-03', title: '鸡' }),
          schedule({ id: 'c3', code: 'C000003', dateKey: '2026-10-02', time: '08:00', title: '鸡' }),
          schedule({ id: 'c4', code: 'C000004', dateKey: '2026-10-02', time: '20:00', title: '鸡' }),
        ],
      }),
      '鸡',
    )
    expect(hits.schedules.map((item) => item.id)).toEqual(['c2', 'c4', 'c3', 'c1'])
  })

  it('没有日期的库表按名称排', () => {
    const hits = searchRows(
      input({
        foods: [
          food({ id: 'fd2', code: 'D000002', name: 'Banana' }),
          food({ id: 'fd1', name: 'apple' }),
        ],
      }),
      'a',
    )
    expect(hits.foods.map((item) => item.id)).toEqual(['fd1', 'fd2'])
  })
})
