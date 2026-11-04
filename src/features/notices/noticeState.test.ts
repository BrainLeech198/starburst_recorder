import { describe, expect, it, beforeEach } from 'vitest'
import { acknowledgeNotice, pickNoticeToShow, shouldShowNotice } from './noticeState'

/**
 * 公告「看过没有」这套本地状态的测试。
 *
 * 这里是整个公告功能里唯一有判断的地方，规则要说清楚：
 *   - 关闭弹窗不等于确认，未确认公告下次仍会出现
 *   - 普通和紧急公告点「确认收到」后都不再出现
 *   - 旧版紧急公告已达到五次上限时保持静默
 *
 * localStorage 在 Node 环境里没有，所以测试直接构造 state 对象传入，
 * 不去碰真实的存储——被测的是判断逻辑，不是存储。
 */

const state = () => ({ ids: [] as string[], urgentCounts: {} as Record<string, number> })

describe('shouldShowNotice', () => {
  it('普通公告：没看过就显示，看过就不显示', () => {
    const notice = { id: 'n1', level: 'info' }
    expect(shouldShowNotice(notice, state())).toBe(true)

    const seen = { ids: ['n1'], urgentCounts: {} }
    expect(shouldShowNotice(notice, seen)).toBe(false)
  })

  it('紧急公告：未确认收到时会再提醒', () => {
    const notice = { id: 'u1', level: 'urgent' }
    const seen = { ids: [], urgentCounts: { u1: 1 } }
    expect(shouldShowNotice(notice, seen)).toBe(true)
  })

  it('旧版紧急公告达到重复提醒上限后保持静默', () => {
    const notice = { id: 'u1', level: 'urgent' }
    const seen = { ids: [], urgentCounts: { u1: 5 } }
    expect(shouldShowNotice(notice, seen)).toBe(false)
  })

  it('旧版紧急公告未达到上限时，关闭次数不等于确认收到', () => {
    const notice = { id: 'u1', level: 'urgent' }
    const seen = { ids: [], urgentCounts: { u1: 3 } }
    expect(shouldShowNotice(notice, seen)).toBe(true)
  })
})

describe('pickNoticeToShow', () => {
  it('紧急公告优先：普通公告不能把它压住', () => {
    const notices = [
      { id: 'n1', level: 'info' },
      { id: 'u1', level: 'urgent' },
    ]
    expect(pickNoticeToShow(notices, state())?.id).toBe('u1')
  })

  it('没有紧急公告时才轮到普通的', () => {
    const notices = [
      { id: 'n1', level: 'info' },
      { id: 'n2', level: 'info' },
    ]
    expect(pickNoticeToShow(notices, state())?.id).toBe('n1')
  })

  it('都看过了就不显示', () => {
    const notices = [
      { id: 'n1', level: 'info' },
      { id: 'u1', level: 'urgent' },
    ]
    const seen = { ids: ['n1'], urgentCounts: { u1: 5 } }
    expect(pickNoticeToShow(notices, seen)).toBeNull()
  })

  it('没有公告就是没有', () => {
    expect(pickNoticeToShow([], state())).toBeNull()
  })
})

describe('acknowledgeNotice', () => {
  beforeEach(() => {
    // Node 环境没有 localStorage，给一个内存版
    const store = new Map()
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage
  })

  it('普通公告确认收到后不再提醒', () => {
    const notice = { id: 'n1', level: 'info' }
    acknowledgeNotice(notice)
    expect(shouldShowNotice(notice)).toBe(false)
  })

  it('紧急公告确认收到后不再提醒', () => {
    const notice = { id: 'u1', level: 'urgent' }
    acknowledgeNotice(notice)
    expect(shouldShowNotice(notice)).toBe(false)
  })
})
