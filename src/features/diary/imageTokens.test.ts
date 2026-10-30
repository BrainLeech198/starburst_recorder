import { describe, expect, it } from 'vitest'
import {
  imageToken,
  insertImageTokens,
  splitImageTokens,
  stripImageTokens,
  usedImageIds,
} from './imageTokens'

const A = '01JA2B3C4D5E6F7G8H9J0KLMNO'

describe('insertImageTokens', () => {
  it('插入时前后补换行，光标落在标记之后', () => {
    const result = insertImageTokens('第一段', 3, [A])
    expect(result.text).toBe(`第一段\n${imageToken(A)}`)
    expect(result.caret).toBe(result.text.length)
  })

  it('已经在行首行尾就不重复加换行', () => {
    // 光标落在第二段行首：前面已有换行，只给后面补一个
    const result = insertImageTokens(`abc\n\nxyz`, 5, [A])
    expect(result.text).toBe(`abc\n\n${imageToken(A)}\nxyz`)
  })

  it('没有图片 id 时原样返回', () => {
    const result = insertImageTokens('abc', 1, [])
    expect(result.text).toBe('abc')
    expect(result.caret).toBe(1)
  })
})

describe('splitImageTokens', () => {
  it('把正文切成文字与图片段，顺序不变', () => {
    const parts = splitImageTokens(`前${imageToken(A)}后`)
    expect(parts).toEqual([
      { type: 'text', value: '前' },
      { type: 'image', id: A },
      { type: 'text', value: '后' },
    ])
  })

  it('只有标记时没有空文字段', () => {
    const parts = splitImageTokens(imageToken(A))
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({ type: 'image', id: A })
  })
})

describe('usedImageIds / stripImageTokens', () => {
  it('认出被正文引用的图片', () => {
    expect(usedImageIds(`a${imageToken(A)}`)).toEqual([A])
    expect(usedImageIds('没有图')).toEqual([])
  })

  it('去掉标记并收拾空行', () => {
    expect(stripImageTokens(`第一段\n\n${imageToken(A)}\n\n第二段`)).toBe('第一段\n\n第二段')
    expect(stripImageTokens('没有图')).toBe('没有图')
  })
})
