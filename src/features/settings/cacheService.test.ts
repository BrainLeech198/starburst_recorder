import { describe, expect, test } from 'vitest'
import { formatCacheSize } from './cacheService'

describe('formatCacheSize', () => {
  test('不到 1 MB 用 KB 取整', () => {
    expect(formatCacheSize(1536)).toBe('2 KB')
    expect(formatCacheSize(1024 * 1024 - 1)).toBe('1024 KB')
  })

  test('1 MB 以上保留一位小数', () => {
    expect(formatCacheSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatCacheSize(15 * 1024 * 1024 + 500 * 1024)).toBe('15.5 MB')
  })

  test('0 字节显示 0 KB', () => {
    expect(formatCacheSize(0)).toBe('0 KB')
  })
})
