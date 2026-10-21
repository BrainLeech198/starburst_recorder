import { describe, expect, it } from 'vitest'
import { interpolate } from './context'

describe('interpolate', () => {
  it('没有参数时原样返回', () => {
    expect(interpolate('保存成功')).toBe('保存成功')
    expect(interpolate('共 {count} 条')).toBe('共 {count} 条')
  })

  it('把占位符换成实际值', () => {
    expect(interpolate('共 {count} 条', { count: 12 })).toBe('共 12 条')
    expect(interpolate('{name}的日记', { name: '星芒' })).toBe('星芒的日记')
  })

  it('重复占位符一起替换', () => {
    expect(interpolate('{a}和{a}', { a: '晴' })).toBe('晴和晴')
  })

  it('缺的字段保留原样，方便一眼看出漏了', () => {
    expect(interpolate('{a}和{b}', { a: '晴' })).toBe('晴和{b}')
  })
})
