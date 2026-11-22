import { describe, expect, it } from 'vitest'
import { weighNotificationSchedule } from './weighReminderMath'

describe('称重提醒排程', () => {
  it('把周一和设置时刻映射到安卓本地通知格式', () => {
    expect(weighNotificationSchedule(1, '07:30')).toEqual({
      every: 'week',
      on: { weekday: 2, hour: 7, minute: 30 },
    })
  })

  it('把周日映射为通知插件的星期日编号', () => {
    expect(weighNotificationSchedule(7, '19:05')?.on).toEqual({
      weekday: 1,
      hour: 19,
      minute: 5,
    })
  })

  it('拒绝无效星期，并对损坏的时间使用 07:00 兜底', () => {
    expect(weighNotificationSchedule(0, '07:00')).toBeNull()
    expect(weighNotificationSchedule(1, 'bad')?.on).toEqual({
      weekday: 2,
      hour: 7,
      minute: 0,
    })
  })
})
