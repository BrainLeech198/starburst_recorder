import { describe, expect, it } from 'vitest'
import {
  bag,
  pickDay,
  pickEntry,
  pickFinance,
  pickHealthGoals,
  pickIntake,
  pickMeal,
  pickFood,
  pickMeasurement,
  pickSleep,
  pickStamp,
  pickTraining,
  pickTrainingPlan,
  rows,
} from './normalize'

describe('行级校验：必填缺失就丢行', () => {
  it('日记缺 id 就丢', () => {
    expect(pickEntry({ id: 'a', dateKey: '2026-10-25', content: 'x' })).not.toBeNull()
    expect(pickEntry({ id: '', dateKey: '2026-10-25', content: 'x' })).toBeNull()
    expect(pickEntry({ dateKey: '2026-10-25', content: 'x' })).toBeNull()
  })

  it('日期必须是日历上真存在的日子，不是只看正则', () => {
    expect(pickEntry({ id: 'a', dateKey: '2026-10-25', content: 'x' })).not.toBeNull()
    expect(pickEntry({ id: 'a', dateKey: '2026-13-40', content: 'x' })).toBeNull()
    expect(pickEntry({ id: 'a', dateKey: '2026-02-30', content: 'x' })).toBeNull()
    expect(pickEntry({ id: 'a', dateKey: '10/25', content: 'x' })).toBeNull()
    // 闰年合法
    expect(pickEntry({ id: 'a', dateKey: '2024-02-29', content: 'x' })).not.toBeNull()
  })

  it('随记缺 id 或日期就丢', () => {
    expect(pickStamp({ id: 'a', dateKey: '2026-10-25', time: '09:30', content: '' })).not.toBeNull()
    expect(pickStamp({ dateKey: '2026-10-25', time: '09:30', content: '' })).toBeNull()
    expect(pickStamp({ id: 'a', dateKey: '2026-02-30', time: '09:30', content: '' })).toBeNull()
  })

  it('随记的时刻写坏时留空，不伪造记录时刻', () => {
    expect(pickStamp({ id: 'a', dateKey: '2026-10-25', time: '9:3', content: 'x' })?.time).toBe(
      '',
    )
  })

  it('随记的短编号缺失时现场补一个 7 位十六进制，已有的原样保留', () => {
    const fresh = pickStamp({ id: 'a', dateKey: '2026-10-25', time: '09:30', content: 'x' })
    expect(fresh?.code).toMatch(/^[0-9a-f]{7}$/)

    const kept = pickStamp({
      id: 'b',
      code: 'abc1234',
      dateKey: '2026-10-25',
      time: '09:30',
      content: 'x',
    })
    expect(kept?.code).toBe('abc1234')
  })

  it('食物没有名字就丢', () => {
    expect(pickEntry({ id: 'a', dateKey: '2026-10-25', content: 'x' })).not.toBeNull()
    expect(pickMeal({ id: 'a', name: '鸡腿饭', items: [] })).not.toBeNull()
  })
})

describe('训练计划档案', () => {
  it('模板只收有效名称与内容，逐条过滤坏数据并限制数量', () => {
    const plan = pickTrainingPlan({
      enabled: true,
      weeklyDays: [1],
      time: '20:00',
      nudgeAfterDays: 3,
      templates: [
        { id: 't1', name: ' 推日 ', kind: 'strength', exercises: [{ id: 'e1', name: '俯卧撑' }] },
        { id: 't2', name: '空模板', exercises: [] },
        { id: '', name: '无 id', exercises: [{ id: 'e2', name: '深蹲' }] },
      ],
    })
    expect(plan?.templates).toHaveLength(1)
    expect(plan?.templates?.[0]).toMatchObject({ id: 't1', name: '推日', kind: 'strength' })
    expect(pickTrainingPlan({ enabled: false, weeklyDays: [], templates: [{ id: 't3', name: '短跑', durationMin: 20 }] })?.templates).toMatchObject([
      { id: 't3', name: '短跑', durationMin: 20 },
    ])
  })
})

describe('行级校验：可选字段补默认', () => {
  it('食物标签会清理坏值；旧备份缺字段时退回空数组', () => {
    const base = { id: 'food-1', name: '鸡胸肉' }
    expect(pickFood(base)?.tags).toEqual([])
    expect(pickFood({ ...base, tags: [' 肉类 ', '', '高蛋白', '肉类', 7] })?.tags).toEqual([
      '肉类',
      '高蛋白',
    ])
  })

  it('旧记录没有目标口径快照，显式给 null 而不是 undefined', () => {
    const intake = pickIntake({
      id: 'a',
      code: 'b',
      dateKey: '2026-10-25',
      time: '12:00',
      name: '牛肉面',
      grams: 300,
      source: 'manual',
    })
    expect(intake).not.toBeNull()
    expect(intake!.tdeeSnapshot).toBeNull()
    expect(intake!.targetKcalSnapshot).toBeNull()
    expect(intake!.proteinTargetSnapshot).toBeNull()
    expect('tdeeSnapshot' in intake!).toBe(true)
    expect(intake!.components).toBeNull()
  })

  it('没有记录摄入时刻时保持为空', () => {
    expect(pickIntake({ id: 'i1', dateKey: '2026-10-25', name: '午饭' })?.time).toBe('')
  })

  it('套餐里认不出的成分直接丢掉，认得出的留下', () => {
    const meal = pickMeal({
      id: 'a',
      name: '鸡腿饭',
      items: [{ foodId: 'x', grams: 150 }, { foodId: '', grams: 1 }, 'junk'],
    })
    expect(meal!.items).toHaveLength(1)
    expect(meal!.items[0]).toEqual({ foodId: 'x', grams: 150 })
  })

  it('套餐封面只认 data:image，旧备份没有照片就是 null', () => {
    const photo = 'data:image/webp;base64,AAAA'
    expect(
      pickMeal({ id: 'a', name: '鸡腿饭', items: [], photo })!.photo,
    ).toBe(photo)
    expect(pickMeal({ id: 'a', name: '鸡腿饭', items: [] })!.photo).toBeNull()
    expect(
      pickMeal({ id: 'a', name: '鸡腿饭', items: [], photo: 'https://example.com/a.png' })!
        .photo,
    ).toBeNull()
  })

  it('天没写天气就是 null，不是空串', () => {
    expect(pickDay({ dateKey: '2026-10-25' })?.weather).toBeNull()
    expect(pickDay({ dateKey: '2026-10-25', weather: '' })?.weather).toBeNull()
    expect(pickDay({ dateKey: '2026-10-25', weather: '晴' })?.weather).toBe('晴')
  })
})

describe('行级校验：多出来的字段不管', () => {
  it('新版备份里的未知字段被丢掉，行本身还在', () => {
    const entry = pickEntry({
      id: 'a',
      dateKey: '2026-10-25',
      content: 'x',
      someFutureField: { nested: true },
    })
    expect(entry).not.toBeNull()
    expect('someFutureField' in (entry as object)).toBe(false)
  })
})

describe('身体测量行：可部分记录，坏字段单独忽略', () => {
  it('兼容旧版只含腰围的记录', () => {
    expect(pickMeasurement({ dateKey: '2026-11-13', waistCm: 74 })).toMatchObject({
      waistCm: 74,
      abdomenCm: null,
      chestCm: null,
      bodyFatPct: null,
    })
  })

  it('保留有效部分，忽略越界围度和体脂率', () => {
    expect(
      pickMeasurement({ dateKey: '2026-11-13', waistCm: 74, chestCm: 500, bodyFatPct: 90 }),
    ).toMatchObject({ waistCm: 74, chestCm: null, bodyFatPct: null })
  })

  it('日期无效或没有任何有效测量时丢弃这一行', () => {
    expect(pickMeasurement({ dateKey: '2026-02-30', waistCm: 74 })).toBeNull()
    expect(pickMeasurement({ dateKey: '2026-11-13', waistCm: 500 })).toBeNull()
  })
})

describe('健康目标：目标由用户输入且坏项目逐条丢弃', () => {
  it('保留合法目标，忽略无效范围、缺少动作名和坏时刻', () => {
    const goals = pickHealthGoals([
      { id: 'weight', type: 'weightRange', minValue: 60, maxValue: 68 },
      { id: 'range', type: 'weightRange', minValue: 70, maxValue: 60 },
      { id: 'lift', type: 'strengthReps', targetValue: 10 },
      { id: 'sleep', type: 'sleepBedtime', targetTime: '25:99', targetDays: 5 },
    ])
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({ id: 'weight', minValue: 60, maxValue: 68, enabled: true })
  })
})

describe('不可信容器', () => {
  it('rows 只认数组，别的都当空', () => {
    expect(rows([1, 2])).toHaveLength(2)
    expect(rows('x')).toEqual([])
    expect(rows(null)).toEqual([])
  })

  it('bag 只认普通对象，数组和原始值都当空', () => {
    expect(bag({ a: 1 })).toEqual({ a: 1 })
    expect(bag([1])).toEqual({})
    expect(bag('x')).toEqual({})
    expect(bag(null)).toEqual({})
  })
})

describe('睡眠行：时刻缺失时保持为空，评分只认 1–5', () => {
  const base = { id: 's1', dateKey: '2026-10-26', bedtime: '23:10', wakeTime: '07:00' }

  it('坏时刻保持为空，缺 code 补一个', () => {
    const row = pickSleep({ ...base, bedtime: '25:99', wakeTime: 7 })
    expect(row).toMatchObject({ bedtime: '', wakeTime: '' })
    expect(row?.code).not.toBe('')
  })

  it('评分越界或缺失都算没评', () => {
    expect(pickSleep({ ...base, quality: 9 })?.quality).toBeNull()
    expect(pickSleep({ ...base, quality: 3 })?.quality).toBe(3)
  })

  it('夜醒次数与分钟：缺失补 null，坏的整数剔掉', () => {
    expect(pickSleep(base)).toMatchObject({ wakeCount: null, wakeMinutes: null })
    expect(pickSleep({ ...base, wakeCount: 2, wakeMinutes: 0 })).toMatchObject({
      wakeCount: 2,
      wakeMinutes: 0,
    })
    expect(pickSleep({ ...base, wakeCount: -1, wakeMinutes: 5000 })).toMatchObject({
      wakeCount: null,
      wakeMinutes: null,
    })
    expect(pickSleep({ ...base, wakeCount: 1.5 })?.wakeCount).toBe(1)
  })

  it('逐条夜醒：只收合法时刻与非负整数分钟，旧记录补空数组', () => {
    expect(pickSleep(base)).toMatchObject({ wakeEvents: [] })
    expect(
      pickSleep({
        ...base,
        wakeEvents: [
          { time: '01:20', minutes: 5 },
          { time: '25:99', minutes: 5 },
          { time: '03:40', minutes: -1 },
          { time: '04:10', minutes: 12.8 },
        ],
      })?.wakeEvents,
    ).toEqual([
      { time: '01:20', minutes: 5 },
      { time: '04:10', minutes: 12 },
    ])
  })

  it('小憩：只收合法的开始与结束，旧记录补空数组', () => {
    expect(pickSleep(base)).toMatchObject({ naps: [] })
    expect(
      pickSleep({
        ...base,
        naps: [
          { start: '13:00', end: '13:40' },
          { start: '25:00', end: '13:00' },
          { start: '17:10', end: '99:99' },
          { start: '21:00', end: '20:00' },
          { start: '19:00', end: '19:25' },
        ],
      })?.naps,
    ).toEqual([
      { start: '13:00', end: '13:40' },
      { start: '19:00', end: '19:25' },
    ])
  })

  it('id 或日期缺失整行丢掉', () => {
    expect(pickSleep({ ...base, id: '' })).toBeNull()
    expect(pickSleep({ ...base, dateKey: '2026-13-40' })).toBeNull()
  })
})

describe('收支行：旧数据按支出读，金额收回正数', () => {
  const base = { id: 'f1', dateKey: '2026-10-31', name: '午饭', amount: 25 }

  it('缺方向、分类、短编号时补默认值', () => {
    const row = pickFinance(base)
    expect(row).toMatchObject({ kind: 'expense', category: '', time: '' })
    expect(row?.code).not.toBe('')
  })

  it('保留明确时刻，错误时刻不按创建时间补造', () => {
    expect(pickFinance({ ...base, time: '08:30' })?.time).toBe('08:30:00')
    expect(pickFinance({ ...base, time: 'bad', createdAt: 1_800_000_000_000 })?.time).toBe('')
  })

  it('训练没有明确时刻时保持为空', () => {
    expect(pickTraining({ id: 't1', dateKey: '2026-10-31' })?.time).toBe('')
  })

  it('只认 income，其余都算支出；金额统一取绝对值', () => {
    expect(pickFinance({ ...base, kind: 'income', amount: -100 })?.kind).toBe('income')
    expect(pickFinance({ ...base, kind: 'weird', amount: -25 })?.kind).toBe('expense')
    expect(pickFinance({ ...base, amount: -25 })?.amount).toBe(25)
  })

  it('id 或日期缺失整行丢掉', () => {
    expect(pickFinance({ ...base, id: '' })).toBeNull()
    expect(pickFinance({ ...base, dateKey: '2026-13-40' })).toBeNull()
  })
})
