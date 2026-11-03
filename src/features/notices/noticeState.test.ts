import { describe, expect, it, beforeEach } from 'vitest'
import { markNoticeSeen, pickNoticeToShow, shouldShowNotice } from './noticeState'

/**
 * 公告「看过没有」这套本地状态的测试。
 *
 * 这里是整个公告功能里唯一有判断的地方，规则要说清楚：
 *   - 普通公告：看过一次就不再出现
 *   - 紧急公告：看过也会再提醒，直到提醒次数用完
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

  it('紧急公告：看过也会再提醒', () => {
    const notice = { id: 'u1', level: 'urgent' }
    const seen = { ids: [], urgentCounts: { u1: 1 } }
    expect(shouldShowNotice(notice, seen)).toBe(true)
  })

  it('紧急公告提醒够多次之后就闭嘴', () => {
    const notice = { id: 'u1', level: 'urgent' }
    const seen = { ids: [], urgentCounts: { u1: 5 } }
    expect(shouldShowNotice(notice, seen)).toBe(false)
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

describe('markNoticeSeen', () => {
  beforeEach(() => {
    // Node 环境没有 localStorage，给一个内存版
    const store = new Map()
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage
  })

  it('普通公告记过一次就不再提醒', () => {
    const notice = { id: 'n1', level: 'info' }
    markNoticeSeen(notice)
    expect(shouldShowNotice(notice)).toBe(false)
  })

  it('紧急公告记一次后还会再提醒，但次数在涨', () => {
    const notice = { id: 'u1', level: 'urgent' }
    markNoticeSeen(notice)
    expect(shouldShowNotice(notice)).toBe(true)

    markNoticeSeen(notice)
    markNoticeSeen(notice)
    markNoticeSeen(notice)
    markNoticeSeen(notice)
    // 第五次之后闭嘴
    expect(shouldShowNotice(notice)).toBe(false)
  })
})
