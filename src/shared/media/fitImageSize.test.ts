import { describe, expect, it } from 'vitest'
import { fitImageSize } from './fitImageSize'

describe('fitImageSize', () => {
  it('缩小横图时完整保留宽高比例', () => {
    expect(fitImageSize(1600, 900, 512)).toEqual({ width: 512, height: 288 })
  })

  it('缩小竖图时完整保留宽高比例', () => {
    expect(fitImageSize(900, 1600, 512)).toEqual({ width: 288, height: 512 })
  })

  it('原图较小时不放大，且无效尺寸返回空尺寸', () => {
    expect(fitImageSize(240, 160, 512)).toEqual({ width: 240, height: 160 })
    expect(fitImageSize(0, 160, 512)).toEqual({ width: 0, height: 0 })
    expect(fitImageSize(-1, 160, 512)).toEqual({ width: 0, height: 0 })
  })
})
