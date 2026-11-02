import { describe, expect, it } from 'vitest'
import { canGoBackFrom } from './backNav'

describe('canGoBackFrom', () => {
  it('栈深大于 0 才算有上一页', () => {
    expect(canGoBackFrom({ idx: 1 })).toBe(true)
    expect(canGoBackFrom({ idx: 7 })).toBe(true)
  })

  it('第一页、没有 state、state 是空对象时都退无可退', () => {
    expect(canGoBackFrom({ idx: 0 })).toBe(false)
    expect(canGoBackFrom(null)).toBe(false)
    expect(canGoBackFrom(undefined)).toBe(false)
    expect(canGoBackFrom({})).toBe(false)
    expect(canGoBackFrom('idx:1')).toBe(false)
  })

  it('state 里是脏数据时按退无可退处理，绝不把用户送出去', () => {
    expect(canGoBackFrom({ idx: '3' })).toBe(false)
    expect(canGoBackFrom({ idx: Number.NaN })).toBe(false)
    expect(canGoBackFrom({ idx: Number.POSITIVE_INFINITY })).toBe(false)
    expect(canGoBackFrom({ idx: -2 })).toBe(false)
  })

  it('history.state 里 idx 与别的字段共存时照样认', () => {
    // react-router 实际写进去的形状：{ usr, key, idx }
    expect(canGoBackFrom({ usr: { fromArchive: true }, key: 'abc', idx: 2 })).toBe(true)
  })
})
