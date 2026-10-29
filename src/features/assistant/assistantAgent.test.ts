import { describe, expect, it } from 'vitest'
import type { ChatTransportResult } from '@/platform/desktop'
import type { BackupData } from '@/core/db/store'
import type { AiConfig } from '@/features/ai/aiConfig'
import {
  buildSystemPrompt,
  parseAssistantMessage,
  parseJsonAction,
  parseToolArguments,
  runAssistant,
  toolSchemas,
} from './assistantAgent'

const CONFIG: AiConfig = {
  providerId: 'deepseek',
  providerName: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: 'sk-test',
  vision: 'unknown',
}

function emptyData(): BackupData {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    sleeps: [],
    finance: [],
  }
}

/** 拼一个 OpenAI 形状的响应体 */
function body(message: Record<string, unknown>): string {
  return JSON.stringify({ choices: [{ message }] })
}

function transport(payload: string, status = 200): ChatTransportResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: payload,
    ms: 1,
  }
}

describe('toolSchemas', () => {
  it('包成 OpenAI 的 function 形状', () => {
    const schemas = toolSchemas()
    expect(schemas.length).toBeGreaterThan(0)
    expect(schemas[0]).toMatchObject({
      type: 'function',
      function: { name: expect.any(String), description: expect.any(String) },
    })
  })
})

describe('buildSystemPrompt', () => {
  it('带上今天、工具清单和只读约束', () => {
    const text = buildSystemPrompt('2026-10-28', false)
    expect(text).toContain('今天是 2026-10-28')
    expect(text).toContain('query_day')
    expect(text).toContain('你只能读')
    expect(text).not.toContain('输出格式')
  })

  it('JSON 模式追加动作协议', () => {
    expect(buildSystemPrompt('2026-10-28', true)).toContain('输出格式')
    expect(buildSystemPrompt('2026-10-28', true)).toContain('"tool"')
  })

  it('有记忆时单独成段', () => {
    const text = buildSystemPrompt('2026-10-28', false, ['用户不吃香菜'])
    expect(text).toContain('【你记得的事】')
    expect(text).toContain('用户不吃香菜')
  })
})

describe('parseAssistantMessage', () => {
  it('取出正文与工具调用', () => {
    const parsed = parseAssistantMessage(
      body({
        content: '我先查一下。',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'query_day', arguments: '{"date":"2026-10-27"}' },
          },
        ],
      }),
    )
    expect(parsed.content).toBe('我先查一下。')
    expect(parsed.toolCalls).toHaveLength(1)
    expect(parsed.toolCalls[0].id).toBe('call_1')
    expect(parsed.toolCalls[0].function.name).toBe('query_day')
    expect(parseToolArguments(parsed.toolCalls[0].function.arguments)).toEqual({
      date: '2026-10-27',
    })
  })

  it('正文是分段数组时拼起来', () => {
    const parsed = parseAssistantMessage(
      body({ content: [{ type: 'text', text: '今天' }, { type: 'text', text: '有记录' }] }),
    )
    expect(parsed.content).toBe('今天有记录')
  })

  it('arguments 直接给成对象也能收', () => {
    const parsed = parseAssistantMessage(
      body({
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'intake_stats', arguments: { from: '2026-10-22' } },
          },
        ],
      }),
    )
    expect(parsed.toolCalls[0].function.arguments).toBe('{"from":"2026-10-22"}')
  })

  it('缺 id 时补一个；没有名字的调用丢掉', () => {
    const parsed = parseAssistantMessage(
      body({
        tool_calls: [
          { type: 'function', function: { name: 'search_diary', arguments: '{}' } },
          { type: 'function', function: { name: '', arguments: '{}' } },
        ],
      }),
    )
    expect(parsed.toolCalls).toHaveLength(1)
    expect(parsed.toolCalls[0].id).toBe('call_0')
  })

  it('坏 JSON 返回空结果', () => {
    expect(parseAssistantMessage('not json')).toEqual({ content: '', toolCalls: [] })
  })
})

describe('parseToolArguments', () => {
  it('坏 JSON 当空参数', () => {
    expect(parseToolArguments('{')).toEqual({})
    expect(parseToolArguments('[]')).toEqual({})
    expect(parseToolArguments('null')).toEqual({})
  })
})

describe('parseJsonAction', () => {
  it('识别纯 JSON 动作', () => {
    expect(parseJsonAction('{"tool":"query_day","args":{"date":"2026-10-27"}}')).toEqual({
      tool: 'query_day',
      args: { date: '2026-10-27' },
    })
  })

  it('去掉代码块标记和前后废话', () => {
    expect(
      parseJsonAction('好的，我查一下：\n```json\n{"tool":"search_diary","args":{}}\n```'),
    ).toEqual({ tool: 'search_diary', args: {} })
  })

  it('没有 tool 或不是 JSON 时返回 null', () => {
    expect(parseJsonAction('{"args":{}}')).toBeNull()
    expect(parseJsonAction('直接回答，没有动作')).toBeNull()
    expect(parseJsonAction('{"tool":"query_day"')).toBeNull()
  })

  it('args 不是对象时当空参数', () => {
    expect(parseJsonAction('{"tool":"profile_stats","args":[]}')).toEqual({
      tool: 'profile_stats',
      args: {},
    })
  })
})

describe('runAssistant', () => {
  it('tools 模式：先执行工具，再返回正文', async () => {
    const steps: string[] = []
    let round = 0
    const request = async () => {
      round += 1
      if (round === 1) {
        return transport(
          body({
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'query_day', arguments: '{"date":"2026-10-27"}' },
              },
            ],
          }),
        )
      }
      return transport(body({ content: '那天没有记录。' }))
    }

    const result = await runAssistant({
      config: CONFIG,
      history: [{ role: 'user', content: '昨天过得怎么样？' }],
      data: emptyData(),
      today: '2026-10-28',
      request,
      onStep: (step) => steps.push(step.name),
    })

    expect(result).toEqual({
      ok: true,
      reply: '那天没有记录。',
      steps: [{ name: 'query_day', text: '2026年10月27日\n这一天没有任何记录。' }],
      mode: 'tools',
    })
    expect(steps).toEqual(['query_day'])
  })

  it('不支持 tools 时降级到 JSON 动作协议', async () => {
    let round = 0
    const request = async () => {
      round += 1
      if (round === 1) return transport('{"error":"tools not supported"}', 400)
      if (round === 2) {
        return transport(body({ content: '{"tool":"profile_stats","args":{}}' }))
      }
      return transport(body({ content: '你还没填身体档案。' }))
    }

    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mode).toBe('json')
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0].name).toBe('profile_stats')
      expect(result.reply).toBe('你还没填身体档案。')
    }
  })

  it('5xx 不降级，直接报错', async () => {
    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request: async () => transport('server error', 500),
    })
    expect(result.ok).toBe(false)
  })

  it('模型什么都没说时给出空回复提示', async () => {
    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request: async () => transport(body({ content: '' })),
    })
    expect(result).toEqual({ ok: false, error: '模型这次没有返回内容，再说一次试试。' })
  })

  it('轮数用完时停在「查太多次」', async () => {
    let calls = 0
    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request: async () => {
        calls += 1
        return transport(
          body({
            tool_calls: [
              {
                id: `call_${calls}`,
                type: 'function',
                function: { name: 'query_day', arguments: '{"date":"2026-10-27"}' },
              },
            ],
          }),
        )
      },
    })
    expect(calls).toBe(6)
    expect(result.ok).toBe(false)
  })
})
