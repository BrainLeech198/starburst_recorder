import { describe, expect, it } from 'vitest'
import {
  bag,
  pickDay,
  pickEntry,
  pickFinance,
  pickIntake,
  pickMeal,
  pickSleep,
  pickStamp,
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

  it('随记的时刻写坏时退回 00:00，宁可挪个位置也不丢内容', () => {
    expect(pickStamp({ id: 'a', dateKey: '2026-10-25', time: '9:3', content: 'x' })?.time).toBe(
      '00:00',
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

describe('行级校验：可选字段补默认', () => {
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

  it('套餐里认不出的成分直接丢掉，认得出的留下', () => {
    const meal = pickMeal({
      id: 'a',
      name: '鸡腿饭',
      items: [{ foodId: 'x', grams: 150 }, { foodId: '', grams: 1 }, 'junk'],
    })
    expect(meal!.items).toHaveLength(1)
    expect(meal!.items[0]).toEqual({ foodId: 'x', grams: 150 })
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

describe('睡眠行：时刻坏了退回 00:00，评分只认 1–5', () => {
  const base = { id: 's1', dateKey: '2026-10-26', bedtime: '23:10', wakeTime: '07:00' }

  it('坏时刻退回 00:00，缺 code 补一个', () => {
    const row = pickSleep({ ...base, bedtime: '25:99', wakeTime: 7 })
    expect(row).toMatchObject({ bedtime: '00:00', wakeTime: '00:00' })
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

  it('id 或日期缺失整行丢掉', () => {
    expect(pickSleep({ ...base, id: '' })).toBeNull()
    expect(pickSleep({ ...base, dateKey: '2026-13-40' })).toBeNull()
  })
})

describe('收支行：旧数据按支出读，金额收回正数', () => {
  const base = { id: 'f1', dateKey: '2026-10-31', name: '午饭', amount: 25 }

  it('缺方向、分类、短编号时补默认值', () => {
    const row = pickFinance(base)
    expect(row).toMatchObject({ kind: 'expense', category: '' })
    expect(row?.code).not.toBe('')
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
