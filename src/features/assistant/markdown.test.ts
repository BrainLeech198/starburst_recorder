import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeHref } from './markdown'

describe('Markdown 解析', () => {
  it('识别标题、代码块、列表与引用', () => {
    const blocks = parseMarkdown(
      ['## 小结', '```ts', 'const a = 1', '```', '- 第一项', '- 第二项', '> 引用一句'].join('\n'),
    )
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, text: '小结' })
    expect(blocks[1]).toEqual({ type: 'code', lang: 'ts', code: 'const a = 1' })
    expect(blocks[2]).toEqual({ type: 'list', ordered: false, items: ['第一项', '第二项'] })
    expect(blocks[3]).toEqual({ type: 'quote', text: '引用一句' })
  })

  it('识别表格与分隔线', () => {
    const blocks = parseMarkdown(
      ['| 项目 | 金额 |', '| --- | --- |', '| 午饭 | 28 |', '---'].join('\n'),
    )
    expect(blocks[0]).toEqual({
      type: 'table',
      header: ['项目', '金额'],
      rows: [['午饭', '28']],
    })
    expect(blocks[1]).toEqual({ type: 'divider' })
  })

  it('段内换行保留在一段里', () => {
    const blocks = parseMarkdown('第一行\n第二行\n\n下一段')
    expect(blocks).toEqual([
      { type: 'paragraph', text: '第一行\n第二行' },
      { type: 'paragraph', text: '下一段' },
    ])
  })
})

describe('行内样式', () => {
  it('拆出粗体、代码与链接', () => {
    const tokens = parseInline('这里 **很重要**，还有 `code` 和 [链接](https://example.com)')
    expect(tokens.map((item) => item.type)).toEqual([
      'text',
      'strong',
      'text',
      'code',
      'text',
      'link',
    ])
    expect(tokens[5]).toEqual({
      type: 'link',
      text: '链接',
      href: 'https://example.com',
    })
  })

  it('危险协议只保留文字', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('data:text/html,hi')).toBeUndefined()
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(parseInline('[点我](javascript:alert(1))')[0]).toEqual({
      type: 'link',
      text: '点我',
    })
  })
})
