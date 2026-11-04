import { describe, expect, it } from 'vitest'
import { AiStreamDecoder, decodeBufferedAiStream } from './aiStream'

describe('AI 流式响应解码', () => {
  it('跨网络分片拼正文与工具参数，并逐段通知界面', () => {
    const visible: string[] = []
    const decoder = new AiStreamDecoder((text) => visible.push(text))
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_","arguments":"{\\"day\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"diary","arguments":"\\"today\\"}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    for (const chunk of chunks) decoder.push(encoder.encode(chunk))

    const result = JSON.parse(decoder.finish()) as {
      choices: Array<{ message: { content: string; tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> } }>
    }
    expect(visible.join('')).toBe('你好')
    expect(result.choices[0].message.content).toBe('你好')
    expect(result.choices[0].message.tool_calls[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'read_diary', arguments: '{"day":"today"}' },
    })
  })

  it('代理缓冲后的 SSE 也能还原，并在解析时交出正文', () => {
    const visible: string[] = []
    const body = decodeBufferedAiStream(
      'data: {"choices":[{"delta":{"content":"答"}}]}\n\ndata: [DONE]\n\n',
      (text) => visible.push(text),
    )
    expect(body).not.toBeNull()
    expect(JSON.parse(body!).choices[0].message.content).toBe('答')
    expect(visible).toEqual(['答'])
    expect(decodeBufferedAiStream('{"choices":[]}')).toBeNull()
  })
})
