import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  isNewerVersion,
  isPrereleaseVersion,
  parseVersion,
  versionParts,
} from './versionCompare'

describe('版本号比较', () => {
  it('去掉 v 前缀与构建元数据', () => {
    expect(versionParts('v0.2.1')).toEqual([0, 2, 1])
    expect(versionParts('0.2.1-beta.3')).toEqual([0, 2, 1])
    expect(parseVersion('1.2.3-beta.2+build.7').prerelease).toEqual(['beta', 2])
    expect(versionParts('1')).toEqual([1, 0, 0])
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

  it('预发布按数字段排序，正式版高于同号测试版', () => {
    expect(compareVersions('0.8.0-beta.2', '0.8.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('0.8.0-beta.10', '0.8.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('0.8.0', '0.8.0-beta.9')).toBeGreaterThan(0)
    expect(compareVersions('0.8.0-beta.1', '0.8.0')).toBeLessThan(0)
    expect(compareVersions('0.8.1-beta.1', '0.8.0')).toBeGreaterThan(0)
  })

  it('能认出测试版', () => {
    expect(isPrereleaseVersion('0.8.0-beta.1')).toBe(true)
    expect(isPrereleaseVersion('v0.7.0')).toBe(false)
  })
})
