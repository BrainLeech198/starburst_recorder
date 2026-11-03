import { describe, expect, it } from 'vitest'
import type { HealthProfile, ScheduleItem } from '@/core/db/schema'
import { buildPushCopy, buildReminderSlots } from './reminderSlots'

const TODAY = '2026-11-03'

function profileOf(over: Partial<HealthProfile> = {}): HealthProfile {
  return {
    id: 'me',
    weighDay: null,
    weighTime: '07:00',
    trainingPlan: undefined,
    ...over,
  } as unknown as HealthProfile
}

function itemOf(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    code: 'aaaaaaa',
    dateKey: TODAY,
    time: '09:00',
    title: '看牙医',
    note: '',
    repeat: 'none',
    weeklyDays: [],
    remind: true,
    doneAt: null,
    doneDays: [],
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  }
}

describe('提醒位：称重与训练', () => {
  it('什么都没设就是空数组', () => {
    expect(buildReminderSlots(profileOf(), [], TODAY)).toEqual([])
  })

  it('称重日按周一=1 换算成周日=0', () => {
    const monday = buildReminderSlots(profileOf({ weighDay: 1, weighTime: '07:30' }), [], TODAY)
    expect(monday).toEqual([
      { id: 'weigh', category: 'weigh', time: '07:30', weekdays: [1] },
    ])
    const sunday = buildReminderSlots(profileOf({ weighDay: 7, weighTime: '08:00' }), [], TODAY)
    expect(sunday[0].weekdays).toEqual([0])
  })

  it('称重时间不合法就不生成', () => {
    expect(buildReminderSlots(profileOf({ weighDay: 1, weighTime: '' }), [], TODAY)).toEqual([])
    expect(buildReminderSlots(profileOf({ weighDay: 1, weighTime: '25:00' }), [], TODAY)).toEqual([])
  })

  it('训练计划按周几展开并去重排序', () => {
    const slots = buildReminderSlots(
      profileOf({
        trainingPlan: { enabled: true, weeklyDays: [5, 1, 5], time: '20:00', nudgeAfterDays: 0 },
      }),
      [],
      TODAY,
    )
    expect(slots).toEqual([
      { id: 'training', category: 'training', time: '20:00', weekdays: [1, 5] },
    ])
  })

  it('训练计划关掉就不生成', () => {
    const slots = buildReminderSlots(
      profileOf({
        trainingPlan: { enabled: false, weeklyDays: [1], time: '20:00', nudgeAfterDays: 0 },
      }),
      [],
      TODAY,
    )
    expect(slots).toEqual([])
  })
})

describe('提醒位：日程', () => {
  it('一次性日程生成带日期的槽', () => {
    const slots = buildReminderSlots(profileOf(), [itemOf({ dateKey: TODAY })], TODAY)
    expect(slots).toEqual([
      { id: 'schedule:item-1:2026-11-03', category: 'schedule', time: '09:00', date: TODAY },
    ])
  })

  it('过去的一次性日程不再排', () => {
    expect(buildReminderSlots(profileOf(), [itemOf({ dateKey: '2026-11-01' })], TODAY)).toEqual([])
  })

  it('超出 30 天的一次性日程不排，第 30 天仍然排', () => {
    expect(buildReminderSlots(profileOf(), [itemOf({ dateKey: '2026-12-04' })], TODAY)).toEqual([])
    const edge = buildReminderSlots(profileOf(), [itemOf({ dateKey: '2026-12-03' })], TODAY)
    expect(edge).toHaveLength(1)
  })

  it('每天重复展开成七天', () => {
    const slots = buildReminderSlots(profileOf(), [itemOf({ repeat: 'daily' })], TODAY)
    expect(slots[0].weekdays).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(slots[0].date).toBeUndefined()
  })

  it('每周重复按周一=1 换算成周日=0 并排序', () => {
    const slots = buildReminderSlots(
      profileOf(),
      [itemOf({ repeat: 'weekly', weeklyDays: [7, 1] })],
      TODAY,
    )
    expect(slots[0].weekdays).toEqual([0, 1])
  })

  it('全天日程（没有时刻）不参与推送', () => {
    expect(buildReminderSlots(profileOf(), [itemOf({ time: '' })], TODAY)).toEqual([])
  })

  it('关掉提醒或已删除的条目不排', () => {
    expect(buildReminderSlots(profileOf(), [itemOf({ remind: false })], TODAY)).toEqual([])
    expect(buildReminderSlots(profileOf(), [itemOf({ deletedAt: 1 })], TODAY)).toEqual([])
  })

  it('日程提醒最多 20 条，避免订阅文档无限膨胀', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      itemOf({ id: `item-${index}`, dateKey: TODAY }),
    )
    const slots = buildReminderSlots(profileOf(), many, TODAY)
    expect(slots).toHaveLength(20)
  })
})

describe('推送文案', () => {
  it('三类各一句，且不含任何用户内容', () => {
    const t = ((key: string) => `[${key}]`) as never
    const copy = buildPushCopy(t)
    expect(Object.keys(copy).sort()).toEqual(['schedule', 'training', 'weigh'])
    expect(copy.schedule.title).toBe('[schedule.notifyTitle]')
    expect(copy.schedule.body).toBe('[push.scheduleBody]')
  })
})
