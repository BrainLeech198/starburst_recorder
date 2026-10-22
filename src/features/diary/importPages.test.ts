import { describe, expect, it } from 'vitest'
import { mergePages } from './importPages'

const placeholder = (page: number) => `［第 ${page} 张没认出来］`

describe('mergePages', () => {
  it('按页序用空行接起来', () => {
    const summary = mergePages(
      [
        { dateKey: '2026-10-22', weather: '晴', content: '第一页。' },
        { dateKey: '', weather: '', content: '第二页。' },
        { dateKey: '', weather: '', content: '第三页。' },
      ],
      placeholder,
    )
    expect(summary.content).toBe('第一页。\n\n第二页。\n\n第三页。')
    expect(summary.done).toBe(3)
    expect(summary.failed).toBe(0)
  })

  it('续页没写日期时跟随上一张，天气只取第一个非空', () => {
    const summary = mergePages(
      [
        { dateKey: '', weather: '', content: '没抬头的一页。' },
        { dateKey: '2026-10-22', weather: '多云', content: '第二页。' },
        { dateKey: '', weather: '雨', content: '第三页。' },
      ],
      placeholder,
    )
    expect(summary.dateKeys).toEqual(['2026-10-22'])
    expect(summary.weather).toBe('多云')
  })

  it('跨日期的页按页序去重列出日期', () => {
    const summary = mergePages(
      [
        { dateKey: '2026-10-21', weather: '', content: '昨天。' },
        { dateKey: '2026-10-22', weather: '', content: '今天。' },
        { dateKey: '2026-10-21', weather: '', content: '又回到昨天。' },
      ],
      placeholder,
    )
    expect(summary.dateKeys).toEqual(['2026-10-21', '2026-10-22'])
  })

  it('失败页留占位，不贡献日期和天气', () => {
    const summary = mergePages(
      [
        { dateKey: '2026-10-22', weather: '晴', content: '第一页。' },
        null,
        { dateKey: '', weather: '', content: '第三页。' },
      ],
      placeholder,
    )
    expect(summary.content).toBe('第一页。\n\n［第 2 张没认出来］\n\n第三页。')
    expect(summary.done).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.dateKeys).toEqual(['2026-10-22'])
  })

  it('整批都没日期时返回空数组，交给调用方用当前日期', () => {
    const summary = mergePages([{ dateKey: '', weather: '', content: '一页。' }], placeholder)
    expect(summary.dateKeys).toEqual([])
  })
})
