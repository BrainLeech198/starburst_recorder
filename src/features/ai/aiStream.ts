import type { ChatToolCall } from '@/platform/desktop'

type StreamFrame = {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: Array<{
      index?: number
      id?: string
      type?: string
      function?: { name?: string; arguments?: string }
    }> }
  }>
  usage?: unknown
}

/** 把 OpenAI 兼容接口的 SSE 增量拼回现有解析器能读的完整响应。 */
export class AiStreamDecoder {
  private buffer = ''
  private content = ''
  private readonly tools = new Map<number, ChatToolCall>()
  private usage: unknown
  private readonly decoder = new TextDecoder()

  constructor(private readonly onContent?: (text: string) => void) {}

  push(bytes: Uint8Array): void {
    this.buffer += this.decoder.decode(bytes, { stream: true })
    this.drain(false)
  }

  finish(): string {
    this.buffer += this.decoder.decode()
    this.drain(true)
    const message = {
      role: 'assistant',
      content: this.content || null,
      ...(this.tools.size > 0
        ? { tool_calls: [...this.tools.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) }
        : {}),
    }
    return JSON.stringify({ choices: [{ message }], ...(this.usage ? { usage: this.usage } : {}) })
  }

  private drain(final: boolean): void {
    while (true) {
      const match = /\r?\n\r?\n/.exec(this.buffer)
      if (!match) break
      const frame = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      this.readFrame(frame)
    }
    if (final && this.buffer.trim() !== '') {
      this.readFrame(this.buffer)
      this.buffer = ''
    }
  }

  private readFrame(frame: string): void {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (data === '' || data === '[DONE]') return
    let parsed: StreamFrame
    try {
      parsed = JSON.parse(data) as StreamFrame
    } catch {
      return
    }
    if (parsed.usage) this.usage = parsed.usage
    const delta = parsed.choices?.[0]?.delta
    const text = typeof delta?.content === 'string' ? delta.content : ''
    if (text !== '') {
      this.content += text
      this.onContent?.(text)
    }
    for (const part of delta?.tool_calls ?? []) {
      const index = part.index ?? 0
      const call = this.tools.get(index) ?? {
        id: '',
        type: 'function' as const,
        function: { name: '', arguments: '' },
      }
      if (part.id) call.id = part.id
      if (part.type === 'function') call.type = 'function'
      if (part.function?.name) call.function.name += part.function.name
      if (part.function?.arguments) call.function.arguments += part.function.arguments
      this.tools.set(index, call)
    }
  }
}

/** 有些兼容代理会缓冲上游 SSE 后装进信封；这种情况仍能解析，只是拿不到实时增量。 */
export function decodeBufferedAiStream(body: string, onContent?: (text: string) => void): string | null {
  if (!body.trimStart().startsWith('data:')) return null
  const decoder = new AiStreamDecoder(onContent)
  decoder.push(new TextEncoder().encode(body))
  return decoder.finish()
}
