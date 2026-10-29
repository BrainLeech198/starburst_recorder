import { describe, expect, it } from 'vitest'
import { DEFAULT_CARE, parseCareState } from './careMode'

describe('parseCareState', () => {
  it('没存过就用默认值', () => {
    expect(parseCareState(null)).toEqual(DEFAULT_CARE)
  })

  it('存过什么就用什么', () => {
    const saved = {
      fontScale: 'xlarge',
      care: true,
      tapTargets: false,
      contrast: true,
      reduceMotion: false,
      guard: true,
    }
    expect(parseCareState(JSON.stringify(saved))).toEqual(saved)
  })

  it('缺字段用默认值补上', () => {
    const parsed = parseCareState(JSON.stringify({ care: true, fontScale: 'large' }))
    expect(parsed).toEqual({ ...DEFAULT_CARE, care: true, fontScale: 'large' })
  })

  it('认不出的字号档位退回默认', () => {
    const parsed = parseCareState(JSON.stringify({ fontScale: 'huge' }))
    expect(parsed.fontScale).toBe(DEFAULT_CARE.fontScale)
    expect(parseCareState(JSON.stringify({ fontScale: 3 })).fontScale).toBe(DEFAULT_CARE.fontScale)
  })

  it('坏掉的 JSON 退回默认值', () => {
    expect(parseCareState('not-json')).toEqual(DEFAULT_CARE)
    expect(parseCareState('')).toEqual(DEFAULT_CARE)
    expect(parseCareState('null')).toEqual(DEFAULT_CARE)
  })

  it('子开关只有 false 显式存着才算关', () => {
    const parsed = parseCareState(JSON.stringify({ tapTargets: false, contrast: 'yes' }))
    expect(parsed.tapTargets).toBe(false)
    expect(parsed.contrast).toBe(true)
  })
})
