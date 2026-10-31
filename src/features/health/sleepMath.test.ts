import { describe, expect, test } from 'vitest'
import { sleepMinutes, sleepParts, sleepWakeStats, sortWakeEvents } from './sleepMath'

describe('sleepMinutes', () => {
  test('跨零点的觉自动加 24 小时', () => {
    expect(sleepMinutes('23:10', '07:00')).toBe(470)
  })

  test('同一天内的觉直接相减', () => {
    expect(sleepMinutes('01:00', '09:00')).toBe(480)
  })

  test('就寝等于起床算 0 分钟，不猜成 24 小时', () => {
    expect(sleepMinutes('22:30', '22:30')).toBe(0)
  })

  test('边界：零点后一分钟', () => {
    expect(sleepMinutes('00:00', '00:01')).toBe(1)
    expect(sleepMinutes('23:59', '00:00')).toBe(1)
  })
})

describe('sleepParts', () => {
  test('拆成小时与分钟', () => {
    expect(sleepParts(470)).toEqual({ h: 7, m: 50 })
    expect(sleepParts(0)).toEqual({ h: 0, m: 0 })
    expect(sleepParts(60)).toEqual({ h: 1, m: 0 })
  })

  test('负数按 0 处理，小数四舍五入', () => {
    expect(sleepParts(-5)).toEqual({ h: 0, m: 0 })
    expect(sleepParts(59.6)).toEqual({ h: 1, m: 0 })
  })
})

describe('sortWakeEvents', () => {
  test('跨零点的凌晨醒来排在入睡之后的末尾', () => {
    const sorted = sortWakeEvents(
      [
        { time: '03:10', minutes: 5 },
        { time: '23:40', minutes: 2 },
        { time: '01:20', minutes: 8 },
      ],
      '23:00',
    )
    expect(sorted.map((event) => event.time)).toEqual(['23:40', '01:20', '03:10'])
  })
})

describe('sleepWakeStats', () => {
  test('有逐条事件时按事件汇总次数与分钟', () => {
    expect(
      sleepWakeStats({
        wakeEvents: [
          { time: '01:20', minutes: 5 },
          { time: '03:40', minutes: 12 },
        ],
        wakeCount: 9,
        wakeMinutes: 99,
      }),
    ).toEqual({ count: 2, minutes: 17 })
  })

  test('没有事件时退回旧记录里的次数与分钟', () => {
    expect(sleepWakeStats({ wakeEvents: [], wakeCount: 2, wakeMinutes: 0 })).toEqual({
      count: 2,
      minutes: 0,
    })
    expect(sleepWakeStats({})).toEqual({ count: null, minutes: null })
  })
})
