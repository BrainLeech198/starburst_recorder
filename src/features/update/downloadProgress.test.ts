import { describe, expect, it } from 'vitest'
import { formatMb, progressPercent } from './downloadProgress'

describe('progressPercent', () => {
  it('没有进度或服务端没给总长度时返回 null', () => {
    expect(progressPercent(null)).toBeNull()
    expect(progressPercent({ received: 1024, total: 0 })).toBeNull()
    expect(progressPercent({ received: 1024, total: -1 })).toBeNull()
  })

  it('按已下载 / 总长度四舍五入成整数百分比', () => {
    expect(progressPercent({ received: 0, total: 100 })).toBe(0)
    expect(progressPercent({ received: 50, total: 200 })).toBe(25)
    expect(progressPercent({ received: 1, total: 3 })).toBe(33)
  })

  it('超出总长度时封顶 100，负值落到 0', () => {
    expect(progressPercent({ received: 120, total: 100 })).toBe(100)
    expect(progressPercent({ received: -10, total: 100 })).toBe(0)
  })
})

describe('formatMb', () => {
  it('按 1 MiB = 1024² 字节保留一位小数', () => {
    expect(formatMb(0)).toBe('0.0')
    expect(formatMb(1536 * 1024)).toBe('1.5')
    expect(formatMb(99510900)).toBe('94.9')
  })
})
