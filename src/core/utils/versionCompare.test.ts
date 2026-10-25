import { describe, expect, it } from 'vitest'
import { isNewerVersion, versionParts } from './versionCompare'

describe('版本号比较', () => {
  it('去掉 v 前缀与预发布后缀', () => {
    expect(versionParts('v0.2.1')).toEqual([0, 2, 1])
    expect(versionParts('0.2.1-beta.3')).toEqual([0, 2, 1])
    expect(versionParts('1')).toEqual([1])
  })

  it('逐段比较，不是按字符串', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  })

  it('同版本与更旧的版本都不算新', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('v0.1.0', '0.1.0')).toBe(false)
  })

  it('缺段按 0 补', () => {
    expect(isNewerVersion('0.2', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.2', '0.2.0')).toBe(false)
  })
})
