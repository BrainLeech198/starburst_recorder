import { describe, expect, it } from 'vitest'
import { parseDateKey, parseTranscript } from './aiVision'

describe('parseDateKey', () => {
  it('兼容中文、斜杠、短横线三种写法', () => {
    expect(parseDateKey('2026年10月15日')).toBe('2026-10-15')
    expect(parseDateKey('2026/10/15')).toBe('2026-10-15')
    expect(parseDateKey('2026-10-15')).toBe('2026-10-15')
  })

  it('只有月日时补上今年', () => {
    expect(parseDateKey('10月15日')).toBe(`${new Date().getFullYear()}-10-15`)
  })

  it('不存在的日期和空值都丢掉', () => {
    expect(parseDateKey('2026-02-30')).toBe('')
    expect(parseDateKey('')).toBe('')
    expect(parseDateKey(undefined)).toBe('')
  })
})

describe('parseTranscript', () => {
  it('读出日期、天气和正文，并剥掉代码块', () => {
    const reply =
      '```json\n{"date":"2026年10月15日","weather":"晴天","content":"下午的课很困。\\n\\n晚上有了新点子。"}\n```'
    expect(parseTranscript(reply)).toEqual({
      dateKey: '2026-10-15',
      weather: '晴',
      content: '下午的课很困。\n\n晚上有了新点子。',
    })
  })

  it('日期或天气缺失时留空，正文照常保留', () => {
    const reply = '{"date":"","weather":"","content":"只认出正文。"}'
    expect(parseTranscript(reply)).toEqual({ dateKey: '', weather: '', content: '只认出正文。' })
  })

  it('模型没按 JSON 回时，整段当正文兜底', () => {
    expect(parseTranscript('今天就写了一段话。')).toEqual({
      dateKey: '',
      weather: '',
      content: '今天就写了一段话。',
    })
  })

  it('照片里没字时返回 null', () => {
    expect(parseTranscript('EMPTY')).toBeNull()
    expect(parseTranscript('```\nEMPTY\n```')).toBeNull()
    expect(parseTranscript('')).toBeNull()
  })
})
