import { describe, expect, it } from 'vitest'
import { nextRecordNavAction } from './recordNav'

describe('nextRecordNavAction', () => {
  it('从记录以外的页面先进入日记', () => {
    expect(nextRecordNavAction('/', false)).toEqual({ type: 'navigate', to: '/diary' })
    expect(nextRecordNavAction('/calendar', false)).toEqual({ type: 'navigate', to: '/diary' })
  })

  it('按日记、健康、经济的顺序切换，也支持板块内子页面', () => {
    expect(nextRecordNavAction('/diary', true)).toEqual({ type: 'navigate', to: '/health' })
    expect(nextRecordNavAction('/health/profile', true)).toEqual({ type: 'navigate', to: '/finance' })
  })

  it('经济页先收起二级栏，再跳到日历', () => {
    expect(nextRecordNavAction('/finance', true)).toEqual({ type: 'collapse' })
    expect(nextRecordNavAction('/finance', false)).toEqual({ type: 'navigate', to: '/calendar' })
    expect(nextRecordNavAction('/finance/trash', false)).toEqual({ type: 'navigate', to: '/calendar' })
  })
})
