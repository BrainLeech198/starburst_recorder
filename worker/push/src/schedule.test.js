import { describe, expect, it } from 'vitest'
import { dedupeKey, isValidTimeZone, localParts, matchSlot } from './schedule.js'

describe('localParts', () => {
  it('按订阅方时区换算，而不是按 Worker 自己的 UTC', () => {
    // UTC 01:30 = 北京时间 09:30（2026-11-03 是周二）
    const parts = localParts('Asia/Shanghai', new Date('2026-11-03T01:30:00Z'))
    expect(parts).toEqual({ dateKey: '2026-11-03', weekday: 2, time: '09:30' })
  })

  it('跨日：UTC 16:00 已经是北京时间的第二天零点', () => {
    const parts = localParts('Asia/Shanghai', new Date('2026-11-03T16:00:00Z'))
    expect(parts.dateKey).toBe('2026-11-04')
    expect(parts.weekday).toBe(3)
    // ICU 在 hour12:false 下会把午夜给成 "24"，必须归一化成 "00"
    expect(parts.time).toBe('00:00')
  })

  it('夏令时切换当天：02:00 那一小时不存在，01:59 之后直接是 03:00', () => {
    const before = localParts('America/New_York', new Date('2026-03-08T06:59:00Z'))
    const after = localParts('America/New_York', new Date('2026-03-08T07:00:00Z'))
    expect(before.time).toBe('01:59')
    expect(after.time).toBe('03:00')
  })

  it('UTC 时区原样返回', () => {
    const parts = localParts('UTC', new Date('2026-11-03T23:05:00Z'))
    expect(parts.time).toBe('23:05')
    expect(parts.dateKey).toBe('2026-11-03')
  })
})

describe('isValidTimeZone', () => {
  it('接受合法 IANA 名，拒绝乱填与空值', () => {
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
  })
})

describe('matchSlot', () => {
  const parts = { dateKey: '2026-11-03', weekday: 2, time: '09:30' }

  it('每周重复：时间对上且星期命中', () => {
    expect(matchSlot({ id: 'a', category: 'weigh', time: '09:30', weekdays: [1, 2] }, parts)).toBe(
      true,
    )
    expect(matchSlot({ id: 'a', category: 'weigh', time: '09:30', weekdays: [3] }, parts)).toBe(
      false,
    )
  })

  it('时间差一分钟就不算命中', () => {
    expect(matchSlot({ id: 'a', category: 'weigh', time: '09:31', weekdays: [2] }, parts)).toBe(
      false,
    )
  })

  it('一次性提醒按日期命中，日期不对就不推', () => {
    expect(matchSlot({ id: 'b', category: 'schedule', time: '09:30', date: '2026-11-03' }, parts)).toBe(
      true,
    )
    expect(matchSlot({ id: 'b', category: 'schedule', time: '09:30', date: '2026-11-04' }, parts)).toBe(
      false,
    )
  })

  it('同时带 date 与 weekdays 时以 date 为准', () => {
    expect(
      matchSlot(
        { id: 'c', category: 'training', time: '09:30', date: '2026-11-04', weekdays: [2] },
        parts,
      ),
    ).toBe(false)
  })

  it('既没有 weekdays 也没有 date 的脏数据不会命中', () => {
    expect(matchSlot({ id: 'd', category: 'weigh', time: '09:30' }, parts)).toBe(false)
    expect(matchSlot(null, parts)).toBe(false)
  })
})

describe('dedupeKey', () => {
  it('同一条提醒在同一天同一分钟只产生一个键', () => {
    const parts = { dateKey: '2026-11-03', weekday: 2, time: '09:30' }
    const slot = { id: 'slot-1', category: 'weigh', time: '09:30', weekdays: [2] }
    expect(dedupeKey('sub:abc', slot, parts)).toBe('sent:sub:abc:slot-1:2026-11-03:09:30')
    expect(dedupeKey('sub:abc', slot, parts)).toBe(dedupeKey('sub:abc', slot, parts))
    expect(dedupeKey('sub:abc', slot, parts)).not.toBe(
      dedupeKey('sub:abc', slot, { ...parts, time: '09:31' }),
    )
  })
})
