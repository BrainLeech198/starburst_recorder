/**
 * 桌面端（SQLite）的全局搜索必须和 `core/search/match.ts` 判得一模一样。
 *
 * 主进程 require 不了 TypeScript，`electron/database.cjs` 里是照规则抄的第二份。
 * 这里把同一批数据喂给两边：SQLite 那份先落库、再经行映射读回来，
 * 比的是「哪些记录命中、按什么顺序排」——抄漏一组、多算一个字段都会在这里露出来。
 */
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AssistantData, BackupData } from './store'
import type { SearchResults } from './store'
import { searchRows } from '@/core/search/match'

const require = createRequire(import.meta.url)
const { createDatabase } = require('../../../electron/database.cjs') as {
  createDatabase: (file: string) => {
    call: (method: string, args: unknown[]) => unknown
    close: () => void
  }
}

const T = 1_700_000_000_000

/** 十类记录各来一条能命中「鸡」的，外加一条回收站里的 */
function fill(call: <T>(method: string, ...args: unknown[]) => T) {
  call('insertEntry', {
    id: 'e1',
    code: 'E000001',
    dateKey: '2026-10-02',
    createdAt: T,
    updatedAt: T,
    content: '周末炖了鸡汤',
    images: [],
    tags: ['生活'],
    deletedAt: null,
  })
  call('insertEntry', {
    id: 'e2',
    code: 'E000002',
    dateKey: '2026-10-03',
    createdAt: T + 1,
    updatedAt: T + 1,
    content: '昨天也炖了鸡',
    images: [],
    tags: ['工作'],
    deletedAt: null,
  })
  call('removeEntry', 'e2')
  call('insertStamp', {
    id: 's1',
    code: 'S000001',
    dateKey: '2026-10-01',
    time: '09:30',
    content: '买鸡腿',
    images: [],
    tags: ['生活', '工作台'],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('addFinance', {
    id: 'n1',
    code: 'N000001',
    dateKey: '2026-10-01',
    time: '12:00:00',
    kind: 'expense',
    category: 'food',
    name: '黄焖鸡',
    amount: 28,
    photo: null,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('addFinance', {
    id: 'n2',
    code: 'N000002',
    dateKey: '2026-10-05',
    time: '10:00:00',
    kind: 'income',
    category: 'salary',
    name: '十月工资',
    amount: 8000,
    photo: null,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveHealthSleep', {
    id: 'sl1',
    code: 'L000001',
    dateKey: '2026-10-01',
    bedtime: '23:10',
    wakeTime: '07:05',
    quality: 4,
    wakeEvents: [],
    naps: [],
    wakeCount: null,
    wakeMinutes: null,
    note: '睡前吃了鸡肉干',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('insertIntake', {
    id: 'i1',
    code: 'I000001',
    dateKey: '2026-10-01',
    time: '12:30',
    foodId: 'fd1',
    name: '鸡腿',
    grams: 120,
    kcal: 181,
    protein: 20,
    carbs: 0,
    fat: 11,
    source: 'library',
    mealId: null,
    components: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveHealthFood', {
    id: 'fd1',
    code: 'D000001',
    name: '鸡腿',
    kcal: 181,
    protein: 20,
    carbs: 0,
    fat: 11,
    servingName: '1 个',
    servingGrams: 120,
    photo: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveHealthFood', {
    id: 'fd2',
    code: 'D000002',
    name: '白菜',
    kcal: 20,
    protein: 1,
    carbs: 3,
    fat: 0,
    servingName: null,
    servingGrams: null,
    photo: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveHealthMeal', {
    id: 'm1',
    name: '黄焖鸡套餐',
    items: [{ foodId: 'fd1', grams: 120 }],
    photo: null,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveHealthTraining', {
    id: 'tr1',
    code: 'R000001',
    dateKey: '2026-10-01',
    time: '19:30',
    kind: 'strength',
    title: '推日',
    exercises: [
      {
        id: 'x1',
        name: '俯卧撑',
        kind: 'strength',
        muscle: 'chest',
        sets: [],
        durationMin: null,
        distanceKm: null,
        note: '做完想吃鸡胸',
      },
    ],
    durationMin: 45,
    feeling: 4,
    note: '',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveSchedule', {
    id: 'c1',
    code: 'C000001',
    dateKey: '2026-10-06',
    time: '18:00',
    title: '买鸡胸肉',
    note: '',
    repeat: 'none',
    weeklyDays: [],
    remind: false,
    doneAt: null,
    doneDays: [],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
  call('saveDiaryPreset', {
    id: 'p1',
    code: 'P000001',
    kind: 'person',
    name: '养鸡的小陈',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
  })
}

/** 只比命中了哪些记录、什么顺序：行内容怎么映射不是这层要盯的 */
function shape(results: SearchResults) {
  return {
    entries: results.entries.map((item) => item.id),
    stamps: results.stamps.map((item) => item.id),
    finance: results.finance.map((item) => item.id),
    sleeps: results.sleeps.map((item) => item.id),
    intakes: results.intakes.map((item) => item.id),
    trainings: results.trainings.map((item) => item.id),
    schedules: results.schedules.map((item) => item.id),
    foods: results.foods.map((item) => item.id),
    meals: results.meals.map((item) => item.id),
    presets: results.presets.map((item) => item.id),
    tags: results.tags,
  }
}

let dir = ''
let db: ReturnType<typeof createDatabase>

function call<T>(method: string, ...args: unknown[]): T {
  return db.call(method, args) as T
}

/** 两边都从同一份「已落库的数据」出发，SQLite 的行映射结果直接喂给纯函数版 */
function both(keyword: string, categoryIds: string[] = []) {
  const rows = call<BackupData>('exportAllData')
  return {
    sqlite: shape(call<SearchResults>('searchRecords', keyword, categoryIds)),
    shared: shape(
      searchRows(
        {
          entries: rows.entries,
          stamps: rows.stamps,
          finance: rows.finance,
          sleeps: rows.sleeps,
          intakes: rows.intakes,
          trainings: rows.trainings,
          schedules: rows.schedules,
          foods: rows.foods,
          meals: rows.meals,
          presets: rows.presets,
        },
        keyword,
        categoryIds,
      ),
    ),
  }
}

function expectSame(keyword: string, categoryIds?: string[]) {
  const { sqlite, shared } = both(keyword, categoryIds)
  expect(sqlite).toEqual(shared)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'starburst-search-'))
  db = createDatabase(join(dir, 'test.sqlite'))
  fill(call)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('桌面端搜索与共享规则一致', () => {
  it('助手摘要不读取图片内容，完整备份仍保留原图', () => {
    const image = 'data:image/png;base64,AAAA'
    call('updateContent', 'e1', '周末炖了鸡汤', [
      { id: 'img1', dataUrl: image, width: 10, height: 10 },
    ])
    call('saveHealthFood', {
      id: 'fd1', code: 'D000001', name: '鸡腿', kcal: 181, protein: 20, carbs: 0, fat: 11,
      servingName: '1 个', servingGrams: 120, photo: image, tags: [],
      createdAt: T, updatedAt: T, deletedAt: null,
    })
    call('saveHealthMeal', {
      id: 'm1', name: '黄焖鸡套餐', items: [{ foodId: 'fd1', grams: 120 }], photo: image,
      createdAt: T, updatedAt: T, deletedAt: null,
    })
    call('saveFinance', {
      id: 'n1', code: 'N000001', dateKey: '2026-10-01', time: '12:00:00', kind: 'expense',
      category: 'food', name: '黄焖鸡', amount: 28, photo: image, note: '',
      createdAt: T, updatedAt: T, deletedAt: null,
    })

    const summary = call<AssistantData>('assistantData')
    expect(summary.entries.find((item) => item.id === 'e1')).toMatchObject({ imageCount: 1 })
    expect(summary.entries.find((item) => item.id === 'e1')).not.toHaveProperty('images')
    expect(summary.foods.find((item) => item.id === 'fd1')).toMatchObject({ hasPhoto: true })
    expect(summary.foods.find((item) => item.id === 'fd1')).not.toHaveProperty('photo')
    expect(summary.meals.find((item) => item.id === 'm1')).toMatchObject({ hasPhoto: true })
    expect(summary.finance.find((item) => item.id === 'n1')).toMatchObject({ hasPhoto: true })

    const backup = call<BackupData>('exportAllData')
    expect(backup.entries.find((item) => item.id === 'e1')?.images[0]?.dataUrl).toBe(image)
    expect(backup.foods.find((item) => item.id === 'fd1')?.photo).toBe(image)
    expect(backup.meals.find((item) => item.id === 'm1')?.photo).toBe(image)
    expect(backup.finance.find((item) => item.id === 'n1')?.photo).toBe(image)
  })

  it('关键词命中十类记录', () => {
    expectSame('鸡')
    expect(both('鸡').sqlite.foods).toEqual(['fd1'])
    // 回收站里那条（e2）不能出现
    expect(both('鸡').sqlite.entries).toEqual(['e1'])
  })

  it('#标签 精确匹配', () => {
    expectSame('#生活')
    expectSame('#工作')
    expectSame('#工作台')
    expect(both('#工作').sqlite.entries).toEqual([])
    expect(both('#工作台').sqlite.stamps).toEqual(['s1'])
  })

  it('收支分类只认传进来的 id', () => {
    expectSame('餐饮', ['food'])
    expectSame('food', [])
    expect(both('餐饮', ['food']).sqlite.finance).toEqual(['n1'])
    expect(both('food', []).sqlite.finance).toEqual([])
  })

  it('空关键词与只有 # 时只回标签', () => {
    expectSame('')
    expectSame('#   ')
    expect(both('').sqlite.tags).toEqual(['生活', '工作台'])
  })

  it('大小写与没有日期的库表', () => {
    expectSame('CHICKEN')
    expectSame('鸡胸')
    expect(both('鸡').sqlite.meals).toEqual(['m1'])
  })
})
