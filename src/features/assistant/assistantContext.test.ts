import { describe, expect, it } from 'vitest'
import {
  compactHistory,
  contextWindow,
  estimateTokens,
  formatTokens,
  parseUsage,
} from './assistantContext'

describe('parseUsage', () => {
  it('读 OpenAI 形状的 usage', () => {
    const body = JSON.stringify({ choices: [], usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280 } })
    expect(parseUsage(body)).toEqual({ prompt: 1200, completion: 80, total: 1280 })
  })

  it('读 input/output 形状，total 缺了就用两项相加', () => {
    const body = JSON.stringify({ usage: { input_tokens: 900, output_tokens: 60 } })
    expect(parseUsage(body)).toEqual({ prompt: 900, completion: 60, total: 960 })
  })

  it('没有 usage、不是 JSON、全是 0 都返回 null', () => {
    expect(parseUsage(JSON.stringify({ choices: [] }))).toBeNull()
    expect(parseUsage('not json')).toBeNull()
    expect(parseUsage(JSON.stringify({ usage: { prompt_tokens: 0, completion_tokens: 0 } }))).toBeNull()
  })
})

describe('estimateTokens', () => {
  it('中文按字算，英文按 4 字符算', () => {
    expect(estimateTokens('今天天气很好')).toBe(6)
    expect(estimateTokens('hello')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('contextWindow', () => {
  it('按模型名猜窗口，认不出来用 128k 兜底', () => {
    expect(contextWindow('gemini-2.5-pro')).toBe(1_048_576)
    expect(contextWindow('claude-sonnet-4')).toBe(200_000)
    expect(contextWindow('moonshot-v1-8k')).toBe(8_192)
    expect(contextWindow('moonshot-v1-32k')).toBe(32_768)
    expect(contextWindow('deepseek-chat')).toBe(128_000)
    expect(contextWindow('whatever-unknown')).toBe(128_000)
  })
})

describe('formatTokens', () => {
  it('小数字原样，过千转 k，过百万转 m', () => {
    expect(formatTokens(980)).toBe('980')
    expect(formatTokens(1200)).toBe('1.2k')
    expect(formatTokens(128_000)).toBe('128k')
    expect(formatTokens(1_048_576)).toBe('1.0m')
  })
})

describe('compactHistory', () => {
  const message = (index: number, body = `第 ${index} 条`) =>
    ({ role: 'user' as const, content: body })

  it('超出条数时只留最近的，并报告省掉几条', () => {
    const history = Array.from({ length: 20 }, (_, index) => message(index))
    const result = compactHistory(history, { maxMessages: 16 })
    expect(result.messages).toHaveLength(16)
    expect(result.dropped).toBe(4)
    expect(result.messages[0].content).toBe('第 4 条')
  })

  it('正文过长时截断并标注', () => {
    const long = '字'.repeat(1200)
    const result = compactHistory([{ role: 'assistant', content: long }], { maxChars: 900 })
    expect(result.dropped).toBe(0)
    expect(typeof result.messages[0].content).toBe('string')
    expect(String(result.messages[0].content)).toContain('（后文略）')
    expect(String(result.messages[0].content).length).toBeLessThan(long.length)
  })

  it('空正文不计入，图片分段原样保留', () => {
    const result = compactHistory([
      { role: 'assistant', content: '   ' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '这张图里有什么' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
        ],
      },
    ])
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].content).toEqual([
      { type: 'text', text: '这张图里有什么' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
    ])
  })
})
