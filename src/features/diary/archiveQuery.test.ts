import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_PAGE_SIZE,
  clampPage,
  kindFrom,
  pageCount,
  pageFrom,
  queryOf,
  slicePage,
} from './archiveQuery'

describe('kindFrom', () => {
  it('只认 diary 与 stamp', () => {
    expect(kindFrom('diary')).toBe('diary')
    expect(kindFrom('stamp')).toBe('stamp')
  })

  it('缺省与脏数据都落到「全部」', () => {
    expect(kindFrom(null)).toBe('all')
    expect(kindFrom(undefined)).toBe('all')
    expect(kindFrom('')).toBe('all')
    expect(kindFrom('DIARY')).toBe('all')
    expect(kindFrom('trash')).toBe('all')
  })
})

describe('pageFrom', () => {
  it('URL 从 1 起，内部从 0 起', () => {
    expect(pageFrom('1')).toBe(0)
    expect(pageFrom('3')).toBe(2)
  })

  it('缺省、0、负数、非数字、小数都当第一页', () => {
    expect(pageFrom(null)).toBe(0)
    expect(pageFrom('0')).toBe(0)
    expect(pageFrom('-4')).toBe(0)
    expect(pageFrom('abc')).toBe(0)
    expect(pageFrom('2.9')).toBe(1)
  })

  it('Infinity 与空串不算数字', () => {
    expect(pageFrom('Infinity')).toBe(0)
    expect(pageFrom('')).toBe(0)
  })
})

describe('pageCount', () => {
  it('没有记录也算一页', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(-3)).toBe(1)
  })

  it('刚好整除时不多出空页', () => {
    expect(pageCount(ARCHIVE_PAGE_SIZE)).toBe(1)
    expect(pageCount(ARCHIVE_PAGE_SIZE + 1)).toBe(2)
  })
})

describe('clampPage', () => {
  it('越界夹到最后一页', () => {
    // 原来在第 5 页，切到只有 21 条（2 页）的筛子
    expect(clampPage(4, 21)).toBe(1)
    expect(clampPage(0, 21)).toBe(0)
  })

  it('空列表只有第 0 页', () => {
    expect(clampPage(6, 0)).toBe(0)
  })
})

describe('slicePage', () => {
  const items = Array.from({ length: 45 }, (_, index) => index)

  it('按页切，最后一页只取剩下的', () => {
    expect(slicePage(items, 0)).toHaveLength(ARCHIVE_PAGE_SIZE)
    expect(slicePage(items, 2)).toEqual([40, 41, 42, 43, 44])
  })

  it('页码越界时退到最后一页，不返回空数组', () => {
    expect(slicePage(items, 99)).toEqual([40, 41, 42, 43, 44])
  })
})

describe('queryOf', () => {
  it('默认值不写进 URL', () => {
    expect(queryOf('all', 0)).toEqual({})
  })

  it('筛子与页码都写，页码回到 1 起', () => {
    expect(queryOf('stamp', 2)).toEqual({ kind: 'stamp', page: '3' })
  })
})
