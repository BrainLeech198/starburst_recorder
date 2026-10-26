import { describe, expect, it } from 'vitest'
import {
  diffText,
  duplicateFoodNames,
  findConflicts,
  findHealthConflicts,
  pickHealth,
  pickIncoming,
} from './diaryMerge'
import type { HealthPart } from './diaryMerge'
import { emptyPayload } from './diaryBackup'
import type { BackupPayload } from './diaryBackup'
import type {
  DiaryDay,
  DiaryEntry,
  DiaryStamp,
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthProfile,
} from '@/core/db/schema'

const entry = (id: string, content: string, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id,
  code: id.padEnd(7, '0'),
  dateKey: '2026-10-23',
  createdAt: 100,
  updatedAt: 100,
  content,
  deletedAt: null,
  ...extra,
})

const stamp = (id: string, content: string, extra: Partial<DiaryStamp> = {}): DiaryStamp => ({
  id,
  code: id.padEnd(7, '0'),
  dateKey: '2026-10-23',
  time: '08:00',
  content,
  createdAt: 100,
  updatedAt: 100,
  deletedAt: null,
  ...extra,
})

const day = (dateKey: string, weather: string | null): DiaryDay => ({
  dateKey,
  weather,
  updatedAt: 100,
})

function conflictsOf(incoming: Partial<BackupPayload>, local: Partial<BackupPayload>) {
  const fill = (part: Partial<BackupPayload>): BackupPayload => ({
    ...emptyPayload(),
    ...part,
  })
  return findConflicts(fill(incoming), fill(local))
}

describe('findConflicts', () => {
  it('本地没有这条 → 不算冲突', () => {
    expect(conflictsOf({ entries: [entry('a', '备份内容')] }, {})).toHaveLength(0)
  })

  it('两边内容一样 → 不算冲突，导入了也不变', () => {
    expect(conflictsOf({ entries: [entry('a', '一样')] }, { entries: [entry('a', '一样')] })).toHaveLength(0)
  })

  it('内容不一样 → 一处冲突，记下两边的内容', () => {
    const found = conflictsOf({ entries: [entry('a', '备份改了')] }, { entries: [entry('a', '本地原内容')] })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'entry', key: 'a', localText: '本地原内容', incomingText: '备份改了' })
  })

  it('摘要会截断，但全文照原样带着，给「看全文」用', () => {
    const long = '长'.repeat(80)
    const found = conflictsOf({ entries: [entry('a', `${long}甲`)] }, { entries: [entry('a', `${long}乙`)] })
    expect(found[0].localText.endsWith('…')).toBe(true)
    expect(found[0].localBody).toBe(`${long}乙`)
    expect(found[0].incomingBody).toBe(`${long}甲`)
  })

  it('删除状态不一样也算冲突', () => {
    const found = conflictsOf(
      { entries: [entry('a', '一样', { deletedAt: 999 })] },
      { entries: [entry('a', '一样')] },
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ localDeleted: false, incomingDeleted: true })
  })

  it('三类表各认一处', () => {
    const found = conflictsOf(
      {
        entries: [entry('e1', 'e-in')],
        stamps: [stamp('s1', 's-in')],
        days: [day('2026-10-23', '晴')],
      },
      {
        entries: [entry('e1', 'e-lo')],
        stamps: [stamp('s1', 's-lo')],
        days: [day('2026-10-23', '阴')],
      },
    )
    expect(found.map((item) => item.kind)).toEqual(['entry', 'stamp', 'day'])
  })
})

describe('pickIncoming', () => {
  const base: BackupPayload = {
    ...emptyPayload(),
    entries: [entry('a', 'A'), entry('b', 'B')],
    stamps: [stamp('s1', 'S1'), stamp('s2', 'S2')],
    days: [day('2026-10-22', '晴'), day('2026-10-23', '阴')],
  }

  it('一个都不保留 → 原样导入', () => {
    const result = pickIncoming(base, new Set())
    expect(result.entries).toEqual(base.entries)
    expect(result.stamps).toEqual(base.stamps)
    expect(result.days).toEqual(base.days)
  })

  it('选了几个保留本地 → 这几条从导入列表里剔掉', () => {
    const result = pickIncoming(base, new Set(['entry:b', 'stamp:s1', 'day:2026-10-22']))
    expect(result.entries.map((item) => item.id)).toEqual(['a'])
    expect(result.stamps.map((item) => item.id)).toEqual(['s2'])
    expect(result.days.map((item) => item.dateKey)).toEqual(['2026-10-23'])
  })
})

describe('diffText', () => {
  /** 拼成一行便于断言：=相同，+不同 */
  const paint = (segments: { text: string; same: boolean }[]) =>
    segments.map((segment) => `${segment.same ? '=' : '+'}${segment.text}`).join('')

  it('中间改了几个字 → 前后相同的部分标成 same', () => {
    const result = diffText('今天去公园散步', '今天去河边散步')
    expect(paint(result.local)).toBe('=今天去+公园=散步')
    expect(paint(result.incoming)).toBe('=今天去+河边=散步')
  })

  it('一边是另一边的前缀 → 短的那边整段相同，长的多出一截差异', () => {
    const result = diffText('今天', '今天很累')
    expect(paint(result.local)).toBe('=今天')
    expect(paint(result.incoming)).toBe('=今天+很累')
  })

  it('完全不同 → 没有 same 段', () => {
    const result = diffText('abc', 'xyz')
    expect(result.local.every((segment) => !segment.same)).toBe(true)
    expect(result.incoming.every((segment) => !segment.same)).toBe(true)
  })

  it('分段拼回去还是原文，一个字都不少', () => {
    const local = '今天去公园散步'
    const incoming = '今天去河边散步'
    const result = diffText(local, incoming)
    expect(result.local.map((segment) => segment.text).join('')).toBe(local)
    expect(result.incoming.map((segment) => segment.text).join('')).toBe(incoming)
  })
})

const food = (id: string, extra: Partial<HealthFood> = {}): HealthFood => ({
  id,
  code: id.padEnd(7, '0'),
  name: '鸡胸肉',
  kcal: 133,
  protein: 24,
  carbs: 0,
  fat: 5,
  servingName: null,
  servingGrams: null,
  createdAt: 100,
  updatedAt: 100,
  deletedAt: null,
  ...extra,
})

const meal = (id: string, extra: Partial<HealthMeal> = {}): HealthMeal => ({
  id,
  name: '鸡腿饭',
  items: [{ foodId: 'f1', grams: 150 }],
  createdAt: 100,
  updatedAt: 100,
  deletedAt: null,
  ...extra,
})

const intake = (id: string, extra: Partial<HealthIntake> = {}): HealthIntake => ({
  id,
  code: id.padEnd(7, '0'),
  dateKey: '2026-10-23',
  time: '12:00',
  foodId: 'f1',
  name: '鸡胸肉',
  grams: 100,
  kcal: 133,
  protein: 24,
  carbs: 0,
  fat: 5,
  source: 'library',
  createdAt: 100,
  updatedAt: 100,
  deletedAt: null,
  ...extra,
})

const profile = (extra: Partial<HealthProfile> = {}): HealthProfile => ({
  id: 'me',
  sex: 'male',
  age: 20,
  heightCm: 176,
  weightKg: 63,
  weightAt: 100,
  activity: 'sedentary',
  tdee: 2350,
  targetKcal: 2050,
  proteinTarget: 100,
  plan: '',
  note: '',
  updatedAt: 100,
  ...extra,
})

function health(part: Partial<HealthPart> = {}): HealthPart {
  return { profile: null, foods: [], meals: [], intakes: [], ...part }
}

describe('健康块的导入冲突', () => {
  it('本地没有 / 两边完全一样 → 都不算冲突', () => {
    expect(findHealthConflicts(health({ foods: [food('f1')] }), health())).toHaveLength(0)
    expect(
      findHealthConflicts(health({ foods: [food('f1')] }), health({ foods: [food('f1')] })),
    ).toHaveLength(0)
  })

  it('同一个食物改了营养 → 食物冲突，两边的摘要都带上', () => {
    const found = findHealthConflicts(
      health({ foods: [food('f1', { kcal: 200 })] }),
      health({ foods: [food('f1')] }),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'food', key: 'f1' })
    expect(found[0].localText).toContain('133 kcal')
    expect(found[0].incomingText).toContain('200 kcal')
  })

  it('套餐组成、摄入数值、身体档案各自成为一处冲突', () => {
    const found = findHealthConflicts(
      health({
        profile: profile({ tdee: 2200 }),
        meals: [meal('m1', { items: [{ foodId: 'f2', grams: 100 }] })],
        intakes: [intake('i1', { kcal: 150 })],
      }),
      health({
        profile: profile(),
        meals: [meal('m1')],
        intakes: [intake('i1')],
      }),
    )
    expect(found.map((item) => item.kind).sort()).toEqual(['intake', 'meal', 'profile'])
  })

  it('选了保留本地就从备份里剔掉，其余照常导入', () => {
    const incoming = health({
      profile: profile({ tdee: 2200 }),
      foods: [food('f1', { kcal: 200 }), food('f2')],
    })
    const picked = pickHealth(
      incoming,
      new Set(['food:f1', 'profile:me']),
    )
    expect(picked.profile).toBeNull()
    expect(picked.foods.map((item) => item.id)).toEqual(['f2'])
  })

  it('同名不同 id 只提示，不会自动合并', () => {
    const names = duplicateFoodNames(
      health({ foods: [food('f9')] }),
      health({ foods: [food('f1')] }),
    )
    expect(names).toEqual(['鸡胸肉'])
  })
})
