/**
 * 桌面端（SQLite）的分块导入：导出 → 原样写回，记录必须一字不差。
 *
 * 0.5.0 之前的 `writeSections` 漏绑了 images 列，替换导入直接炸在
 * NOT NULL constraint failed: diaryEntries.images；只导随记时参数整体错位，
 * 图片被写成时间戳。这层测试盯的就是「绑定参数与 SQL 列数对不齐」这类毛病。
 */
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { countRecords, type TableTotals } from './store'
import type { DiaryEntry, DiaryImage, DiaryStamp, HealthTraining, ScheduleItem } from './schema'

const require = createRequire(import.meta.url)
const { createDatabase } = require('../../../electron/database.cjs') as {
  createDatabase: (file: string) => {
    call: (method: string, args: unknown[]) => unknown
    close: () => void
  }
}

const image: DiaryImage = {
  id: 'img1',
  dataUrl: 'data:image/png;base64,AAAA',
  width: 10,
  height: 10,
}

const entry: DiaryEntry = {
  id: 'e1',
  code: 'E000001',
  dateKey: '2026-10-30',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  content: '日记 [[img:img1]]',
  images: [image],
  tags: [],
  deletedAt: null,
}

const stamp: DiaryStamp = {
  id: 's1',
  code: 'S000001',
  dateKey: '2026-10-30',
  time: '08:00',
  content: '随记 [[img:img1]]',
  images: [image],
  tags: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
}

let dir = ''
let db: ReturnType<typeof createDatabase>

function call<T>(method: string, ...args: unknown[]): T {
  return db.call(method, args) as T
}

function exportAll() {
  return call<{ entries: DiaryEntry[]; stamps: DiaryStamp[] }>('exportAllData')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'starburst-import-'))
  db = createDatabase(join(dir, 'test.sqlite'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('桌面端 SQLite 分块导入', () => {
  it('替换导入保留日记与随记的图片', () => {
    call('insertEntry', entry)
    call('insertStamp', stamp)
    const before = exportAll()

    call('replaceSections', {
      diary: { entries: before.entries, stamps: before.stamps, days: [], presets: [] },
    })

    const after = exportAll()
    expect(after.entries[0].images).toEqual([image])
    expect(after.stamps[0].images).toEqual([image])
    expect(after.entries[0].content).toBe(entry.content)
    expect(after.stamps[0].content).toBe(stamp.content)
    expect(after.stamps[0].updatedAt).toBe(stamp.updatedAt)
  })

  it('只导随记时不会把参数错位写进图片列', () => {
    call('insertStamp', stamp)
    const before = exportAll()

    call('replaceSections', { diary: { entries: [], stamps: before.stamps, days: [], presets: [] } })

    const after = exportAll()
    expect(after.stamps[0].images).toEqual([image])
    expect(after.stamps[0].createdAt).toBe(stamp.createdAt)
    expect(after.stamps[0].deletedAt).toBeNull()
  })

  it('合并导入同样保留图片，回收站里的行也不例外', () => {
    const trashed = { ...entry, id: 'e2', code: 'E000002', deletedAt: 1_700_000_001_000 }
    call('insertEntry', entry)

    call('importSections', {
      diary: { entries: [entry, trashed], stamps: [stamp], days: [], presets: [] },
    })

    const after = exportAll()
    const byId = new Map(after.entries.map((row) => [row.id, row]))
    expect(byId.get('e1')?.images).toEqual([image])
    expect(byId.get('e2')?.images).toEqual([image])
    expect(byId.get('e2')?.deletedAt).toBe(trashed.deletedAt)
    expect(after.stamps[0].images).toEqual([image])
  })

  it('健康分块往返后照片与字段都还在', () => {
    call('saveHealthFood', {
      id: 'f1',
      code: 'F000001',
      name: '米饭',
      kcal: 116,
      protein: 2.6,
      carbs: 25.9,
      fat: 0.3,
      servingName: '碗',
      servingGrams: 150,
      photo: 'data:image/png;base64,BBBB',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    })
    const before = call<{
      profile: unknown
      foods: unknown[]
      meals: unknown[]
      intakes: unknown[]
      sleeps: unknown[]
    }>('exportAllData')

    call('replaceSections', {
      health: {
        profile: null,
        foods: before.foods,
        meals: before.meals,
        intakes: before.intakes,
        sleeps: before.sleeps,
      },
    })

    const after = call<{ foods: Array<{ photo: string | null }> }>('exportAllData')
    expect(after.foods[0].photo).toBe('data:image/png;base64,BBBB')
  })

  it('睡眠分块往返后小憩一次不丢', () => {
    const naps = [
      { start: '13:00', end: '13:40' },
      { start: '17:10', end: '17:30' },
    ]
    call('saveHealthSleep', {
      id: 'sl1',
      code: 'A000001',
      dateKey: '2026-11-01',
      bedtime: '23:10',
      wakeTime: '07:05',
      quality: 4,
      wakeEvents: [],
      naps,
      wakeCount: null,
      wakeMinutes: null,
      note: '午后补觉',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    })
    const before = call<{ sleeps: unknown[] }>('exportAllData')

    call('replaceSections', {
      health: {
        profile: null,
        foods: [],
        meals: [],
        intakes: [],
        sleeps: before.sleeps,
      },
    })

    const after = call<{ sleeps: Array<{ naps: unknown }> }>('exportAllData')
    expect(after.sleeps[0].naps).toEqual(naps)
  })

  it('训练分块往返后动作、每组数字与空值都还在', () => {
    const training: HealthTraining = {
      id: 'tr1',
      code: 'T000001',
      dateKey: '2026-11-01',
      time: '19:30',
      kind: 'strength',
      title: '推日',
      exercises: [
        {
          id: 'ex1',
          name: '卧推',
          kind: 'strength',
          muscle: 'chest',
          sets: [
            { reps: 8, weightKg: 40, durationSec: null, restSec: 90, rpe: 8 },
            { reps: 8, weightKg: 40, durationSec: null, restSec: null, rpe: null },
            { reps: 6, weightKg: 42.5, durationSec: null, restSec: null, rpe: 9 },
          ],
          durationMin: null,
          distanceKm: null,
          note: '',
        },
        {
          id: 'ex2',
          name: '跑步',
          kind: 'cardio',
          muscle: 'cardio',
          sets: [
            { reps: null, weightKg: null, durationSec: 1200, restSec: null, rpe: null },
            { reps: null, weightKg: null, durationSec: null, restSec: null, rpe: null },
          ],
          durationMin: 20,
          distanceKm: 3.5,
          note: '慢跑',
        },
      ],
      durationMin: 45,
      feeling: 4,
      note: '状态不错',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    }
    call('saveHealthTraining', training)
    const before = call<{ trainings: HealthTraining[] }>('exportAllData')
    expect(before.trainings[0].exercises).toHaveLength(2)

    call('replaceSections', {
      health: {
        profile: null,
        foods: [],
        meals: [],
        intakes: [],
        sleeps: [],
        trainings: before.trainings,
      },
    })

    const after = call<{ trainings: HealthTraining[] }>('exportAllData')
    expect(after.trainings).toHaveLength(1)
    expect(after.trainings[0]).toEqual(before.trainings[0])
    expect(after.trainings[0].exercises[1].sets[1]).toEqual({
      reps: null,
      weightKg: null,
      durationSec: null,
      restSec: null,
      rpe: null,
    })
  })

  it('经济分块往返后时刻与票据照片都还在', () => {
    call('addFinance', {
      id: 'fi1',
      code: 'F000001',
      dateKey: '2026-11-01',
      time: '12:34:56',
      kind: 'expense',
      category: 'food',
      name: '午饭',
      amount: 25,
      photo: 'data:image/png;base64,CCCC',
      note: '',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    })
    const before = call<{ finance: Array<Record<string, unknown>> }>('exportAllData')

    call('replaceSections', { finance: { entries: before.finance } })

    const after = call<{ finance: Array<Record<string, unknown>> }>('exportAllData')
    expect(after.finance[0].time).toBe('12:34:56')
    expect(after.finance[0].photo).toBe('data:image/png;base64,CCCC')
  })

  it('日程分块往返后重复规则与完成记录都还在', () => {
    const item: ScheduleItem = {
      id: 'sc1',
      code: 'C000001',
      dateKey: '2026-11-02',
      time: '20:00',
      title: '练腿',
      note: '深蹲三组',
      repeat: 'weekly',
      weeklyDays: [1, 3, 5],
      remind: true,
      doneAt: null,
      doneDays: ['2026-11-02', '2026-11-04'],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    }
    call('saveSchedule', item)
    const before = call<{ schedules: ScheduleItem[] }>('exportAllData')
    expect(before.schedules[0].weeklyDays).toEqual([1, 3, 5])

    call('replaceSections', {
      diary: {
        entries: [],
        stamps: [],
        days: [],
        presets: [],
        schedules: before.schedules,
      },
    })

    const after = call<{ schedules: ScheduleItem[] }>('exportAllData')
    expect(after.schedules).toHaveLength(1)
    expect(after.schedules[0]).toEqual(before.schedules[0])
    expect(after.schedules[0].remind).toBe(true)
    expect(after.schedules[0].doneDays).toEqual(['2026-11-02', '2026-11-04'])
  })

  it('训练软删除后进回收站，恢复与彻底删除都能用', () => {
    const training: HealthTraining = {
      id: 'tr2',
      code: 'T000002',
      dateKey: '2026-11-01',
      time: '07:00',
      kind: 'cardio',
      title: '',
      exercises: [],
      durationMin: 30,
      feeling: null,
      note: '',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    }
    call('saveHealthTraining', training)
    call('removeHealthTraining', 'tr2')
    expect(call<HealthTraining[]>('trainingOfDay', '2026-11-01')).toHaveLength(0)
    expect(call<HealthTraining[]>('trashedHealthTrainings')).toHaveLength(1)

    call('restoreHealthTraining', 'tr2')
    expect(call<HealthTraining[]>('trainingOfDay', '2026-11-01')).toHaveLength(1)

    call('purgeHealthTraining', 'tr2')
    expect(call<{ trainings: HealthTraining[] }>('exportAllData').trainings).toHaveLength(0)
  })
})

/**
 * 「数据概览」与「清空数据」都读这一层，界面上漏一张表就是用户以为导出了、其实没导。
 * 日程 0.9 才加、训练 0.10 才加，两边最容易慢半拍的就是这两块。
 */
describe('桌面端数据概览与一键清空', () => {
  const T = 1_700_000_000_000

  /** 每张表各一条在用的记录，档案里两次称重 */
  function seedOneEach() {
    call('insertEntry', entry)
    call('insertStamp', stamp)
    call('setWeather', '2026-10-30', '晴')
    call('saveDiaryPreset', {
      id: 'p1',
      code: 'P000001',
      kind: 'person',
      name: '小陈',
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
    })
    call('saveSchedule', {
      id: 'sc1',
      code: 'C000001',
      dateKey: '2026-11-02',
      time: '20:00',
      title: '练腿',
      note: '',
      repeat: 'daily',
      weeklyDays: [],
      remind: false,
      doneAt: null,
      doneDays: [],
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
    })
    call('saveHealthProfile', {
      id: 'me',
      sex: null,
      age: null,
      heightCm: null,
      weightKg: 60,
      weightAt: T,
      activity: null,
      tdee: null,
      targetKcal: null,
      proteinTarget: null,
      plan: '',
      note: '',
      weighDay: null,
      weighTime: '07:00',
      weighIns: [
        { dateKey: '2026-11-01', weightKg: 60, createdAt: T },
        { dateKey: '2026-11-02', weightKg: 59.5, createdAt: T },
      ],
      idealBedtime: '23:00',
      idealWakeTime: '07:00',
      createdAt: T,
      updatedAt: T,
    })
    call('saveHealthFood', {
      id: 'fd1',
      code: 'D000001',
      name: '鸡腿',
      kcal: 181,
      protein: 20,
      carbs: 0,
      fat: 11,
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
    call('insertIntake', {
      id: 'i1',
      code: 'I000001',
      dateKey: '2026-10-30',
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
    call('saveHealthSleep', {
      id: 'sl1',
      code: 'L000001',
      dateKey: '2026-10-30',
      bedtime: '23:10',
      wakeTime: '07:05',
      quality: 4,
      wakeEvents: [],
      naps: [],
      wakeCount: null,
      wakeMinutes: null,
      note: '',
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
    })
    call('saveHealthTraining', {
      id: 'tr1',
      code: 'R000001',
      dateKey: '2026-10-30',
      time: '19:30',
      kind: 'strength',
      title: '推日',
      exercises: [],
      durationMin: 45,
      feeling: 4,
      note: '',
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
    })
    call('addFinance', {
      id: 'fi1',
      code: 'F000001',
      dateKey: '2026-10-30',
      time: '12:34:56',
      kind: 'expense',
      category: 'food',
      name: '午饭',
      amount: 25,
      photo: null,
      note: '',
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
    })
  }

  it('概览把每张表都数到，一条不漏', () => {
    seedOneEach()
    expect(call('totals')).toEqual({
      entries: 1,
      stamps: 1,
      days: 1,
      presets: 1,
      schedules: 1,
      foods: 1,
      meals: 1,
      intakes: 1,
      sleeps: 1,
      trainings: 1,
      weights: 2,
      finance: 1,
    })
  })

  it('总数徽章：天气按天存，不算一条记录', () => {
    seedOneEach()
    expect(countRecords(call<TableTotals>('totals'))).toBe(12)
    call('removeEntry', 'e1')
    expect(countRecords(call<TableTotals>('totals'))).toBe(11)
  })

  it('回收站里的记录不算进概览', () => {
    seedOneEach()
    call('removeEntry', 'e1')
    call('removeSchedule', 'sc1')
    call('removeHealthTraining', 'tr1')
    const counts = call<Record<string, number>>('totals')
    expect(counts.entries).toBe(0)
    expect(counts.schedules).toBe(0)
    expect(counts.trainings).toBe(0)
    // 天气挂在日期上，没有回收站概念
    expect(counts.days).toBe(1)
    // 导出仍然带上回收站里的，否则恢复备份就找不回来
    expect(call<{ schedules: ScheduleItem[] }>('exportAllData').schedules).toHaveLength(1)
  })

  it('一键清空日记块连日程一起清掉', () => {
    seedOneEach()
    call('clearDiaryData')
    const after = call<{
      entries: unknown[]
      stamps: unknown[]
      days: unknown[]
      presets: unknown[]
      schedules: ScheduleItem[]
    }>('exportAllData')
    expect(after.entries).toHaveLength(0)
    expect(after.stamps).toHaveLength(0)
    expect(after.days).toHaveLength(0)
    expect(after.presets).toHaveLength(0)
    expect(after.schedules).toHaveLength(0)
    // 其它块一个字都不动
    const counts = call<Record<string, number>>('totals')
    expect(counts.finance).toBe(1)
    expect(counts.trainings).toBe(1)
  })

  it('安全清空日记块把日程也送进回收站', () => {
    seedOneEach()
    call('trashDiaryData')
    const counts = call<Record<string, number>>('totals')
    expect(counts.entries).toBe(0)
    expect(counts.schedules).toBe(0)
    const after = call<{ schedules: ScheduleItem[]; entries: DiaryEntry[] }>('exportAllData')
    expect(after.schedules).toHaveLength(1)
    expect(after.schedules[0].deletedAt).not.toBeNull()
    expect(after.entries).toHaveLength(1)
  })

  it('替换导入只勾日记块时，健康与经济原样留着', () => {
    seedOneEach()
    call('replaceSections', {
      diary: { entries: [], stamps: [], days: [], presets: [], schedules: [] },
    })
    const counts = call<Record<string, number>>('totals')
    expect(counts.entries).toBe(0)
    expect(counts.schedules).toBe(0)
    expect(counts.finance).toBe(1)
    expect(counts.sleeps).toBe(1)
  })

  it('单独替换日程或训练块时，其它相关数据保持不变', () => {
    seedOneEach()
    call('replaceSections', { schedule: { items: [] } })
    let after = call<{ entries: DiaryEntry[]; schedules: ScheduleItem[] }>('exportAllData')
    expect(after.entries).toHaveLength(1)
    expect(after.schedules).toHaveLength(0)

    call('replaceSections', { training: { entries: [] } })
    after = call<{ entries: DiaryEntry[]; schedules: ScheduleItem[] }>('exportAllData')
    const health = call<{ foods: unknown[]; trainings: HealthTraining[] }>('exportAllData')
    expect(after.entries).toHaveLength(1)
    expect(health.foods).toHaveLength(1)
    expect(health.trainings).toHaveLength(0)
  })
})
