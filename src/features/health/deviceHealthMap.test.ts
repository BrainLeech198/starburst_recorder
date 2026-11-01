import { describe, expect, it } from 'vitest'
import { sleepsFromSamples, weighInsFromSamples, type DeviceSample } from './deviceHealthMap'

function weight(value: number, unit: string, startDate: string): DeviceSample {
  return { dataType: 'weight', value, unit, startDate, endDate: startDate }
}

describe('weighInsFromSamples', () => {
  it('按天去重取最新一条，克制的读数换算成公斤', () => {
    const samples: DeviceSample[] = [
      weight(70.5, 'kilogram', '2026-10-30T07:00:00'),
      weight(70.1, 'kilogram', '2026-10-30T21:00:00'),
      weight(70500, 'gram', '2026-10-28T07:00:00'),
    ]
    const list = weighInsFromSamples(samples)
    expect(list.map((item) => item.dateKey)).toEqual(['2026-10-30', '2026-10-28'])
    expect(list[0].weightKg).toBe(70.1)
    expect(list[1].weightKg).toBe(70.5)
  })

  it('不合理的读数和别的数据类型直接丢掉', () => {
    const samples: DeviceSample[] = [
      weight(7, 'kilogram', '2026-10-30T07:00:00'),
      weight(0, 'kilogram', '2026-10-30T08:00:00'),
      { dataType: 'steps', value: 8000, unit: 'count', startDate: '2026-10-30T09:00:00', endDate: '2026-10-30T09:00:00' },
    ]
    expect(weighInsFromSamples(samples)).toEqual([])
  })
})

describe('sleepsFromSamples', () => {
  it('把跨零点的分段拼成一整夜，清醒段收成夜醒', () => {
    const samples: DeviceSample[] = [
      {
        dataType: 'sleep',
        value: 0,
        unit: 'minute',
        startDate: '2026-10-30T23:10:00',
        endDate: '2026-10-31T07:00:00',
        sourceName: '华为运动健康',
        stages: [
          { startDate: '2026-10-30T23:10:00', endDate: '2026-10-31T01:00:00', stage: 'deep' },
          { startDate: '2026-10-31T01:00:00', endDate: '2026-10-31T01:20:00', stage: 'awake' },
          { startDate: '2026-10-31T01:20:00', endDate: '2026-10-31T07:00:00', stage: 'light' },
        ],
      },
    ]
    const list = sleepsFromSamples(samples)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      // dateKey 跟已有睡眠记录一个口径：记在起床那天
      dateKey: '2026-10-31',
      bedtime: '23:10',
      wakeTime: '07:00',
      // 睡着的时间不含中间醒着的 20 分钟
      minutes: 110 + 340,
      source: '华为运动健康',
      wakeEvents: [{ time: '01:00', minutes: 20 }],
    })
  })

  it('太短的午睡不算一夜', () => {
    const samples: DeviceSample[] = [
      { dataType: 'sleep', value: 0, unit: 'minute', startDate: '2026-10-30T14:00:00', endDate: '2026-10-30T14:40:00', sleepState: 'asleep' },
    ]
    expect(sleepsFromSamples(samples)).toEqual([])
  })

  it('只有「躺在床上」的整段时也能按睡眠导入', () => {
    const samples: DeviceSample[] = [
      { dataType: 'sleep', value: 0, unit: 'minute', startDate: '2026-10-30T23:00:00', endDate: '2026-10-31T07:00:00', sleepState: 'inBed' },
    ]
    const list = sleepsFromSamples(samples)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ dateKey: '2026-10-31', bedtime: '23:00', wakeTime: '07:00', minutes: 480 })
  })
})
