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
    schedules: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    sleeps: [],
    trainings: [],
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
  it('带上今天、读写工具清单和确认后才写入的约束', () => {
    const text = buildSystemPrompt('2026-10-28', false)
    expect(text).toContain('今天是 2026-10-28')
    expect(text).toContain('query_day')
    expect(text).toContain('add_finance')
    expect(text).toContain('待确认卡片')
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

  it('已确认写入的内容单独成段', () => {
    const text = buildSystemPrompt('2026-10-28', false, [], ['2026-10-28 支出：午饭 28 元'])
    expect(text).toContain('用户已经确认写入')
    expect(text).toContain('午饭 28 元')
  })

  it('拒绝与撤销的卡片结果单独成段', () => {
    const text = buildSystemPrompt(
      '2026-10-28',
      false,
      [],
      [],
      [],
      [],
      'confirm',
      ['用户拒绝，没有写入：记忆 · 不吃香菜'],
    )
    expect(text).toContain('用户对之前卡片的处理结果')
    expect(text).toContain('用户拒绝，没有写入')
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

describe('permission', () => {
  it('只读档的提示词里没有写工具，也不给模型写工具', async () => {
    const text = buildSystemPrompt('2026-10-28', false, [], [], [], [], 'readonly')
    expect(text).toContain('【权限：只读】')
    expect(text).not.toContain('add_finance')
    expect(text).not.toContain('update_diary')

    let sentTools = ''
    await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      permission: 'readonly',
      request: async (request) => {
        sentTools = JSON.stringify(request.tools ?? [])
        return transport(body({ content: '只能看，不能改。' }))
      },
    })
    expect(sentTools).not.toContain('add_finance')
    expect(sentTools).not.toContain('delete_stamp')
  })

  it('只读档即便模型硬要写，也不生成卡片', async () => {
    let round = 0
    let toolResult = ''
    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      permission: 'readonly',
      request: async (request) => {
        round += 1
        if (round === 1) {
          return transport(
            body({
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'add_finance', arguments: '{"name":"午饭","amount":28}' },
                },
              ],
            }),
          )
        }
        toolResult = String(request.messages.at(-1)?.content ?? '')
        return transport(body({ content: '现在是只读权限，我不改记录。' }))
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.pending).toBeUndefined()
    expect(toolResult).toContain('只读')
  })

  it('新增自动保存档只让纯新增免确认，修改和删除仍要确认', () => {
    const prompt = buildSystemPrompt('2026-10-28', false, [], [], [], [], 'auto')
    expect(prompt).toContain('【权限：新增自动保存】')
    expect(prompt).toContain('纯新增记录会在卡片生成后自动保存')
    expect(prompt).toContain('修改已有记录、覆盖同一天的数据和删除都需要用户点「确认」')
    expect(buildSystemPrompt('2026-10-28', false)).toContain('【权限：改前确认】')
  })
})

describe('旧记录照片', () => {
  it('只在用户明确指定照片时把选中的一张放进后续模型请求', async () => {
    const data = emptyData()
    data.entries.push({
      id: 'd1', code: 'D000001', dateKey: '2026-10-28', content: '图', tags: [],
      images: [{ id: 'i1', dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 }],
      createdAt: 1, updatedAt: 1, deletedAt: null,
    })
    let round = 0
    let sent = ''
    const result = await runAssistant({
      config: CONFIG, data, today: '2026-10-28',
      history: [{ role: 'user', content: '请分析 2026-10-28 日记的照片' }],
      prepareRecordImage: async (source) => source,
      request: async (request) => {
        round += 1
        if (round === 1) return transport(body({ tool_calls: [{
          id: 'photo_1', type: 'function',
          function: { name: 'read_record_photo', arguments: '{"kind":"diary","ref":"D000001","index":1}' },
        }] }))
        sent = JSON.stringify(request.messages)
        return transport(body({ content: '看到了照片。' }))
      },
    })
    expect(result.ok).toBe(true)
    expect(sent).toContain('data:image/png;base64,AAAA')
    expect(sent).toContain('image_url')
  })

  it('普通查询即使模型主动要照片也不发送像素', async () => {
    const data = emptyData()
    data.entries.push({
      id: 'd1', code: 'D000001', dateKey: '2026-10-28', content: '图', tags: [],
      images: [{ id: 'i1', dataUrl: 'data:image/png;base64,SECRET', width: 10, height: 10 }],
      createdAt: 1, updatedAt: 1, deletedAt: null,
    })
    let round = 0
    let sent = ''
    await runAssistant({
      config: CONFIG, data, today: '2026-10-28',
      history: [{ role: 'user', content: '总结 2026-10-28 的日记' }],
      prepareRecordImage: async () => { throw new Error('不该处理图片') },
      request: async (request) => {
        round += 1
        if (round === 1) return transport(body({ tool_calls: [{
          id: 'photo_1', type: 'function',
          function: { name: 'read_record_photo', arguments: '{"kind":"diary","ref":"D000001","index":1}' },
        }] }))
        sent = JSON.stringify(request.messages)
        return transport(body({ content: '只看文字。' }))
      },
    })
    expect(sent).not.toContain('SECRET')
    expect(sent).not.toContain('image_url')
  })
})

describe('reasoning', () => {
  it('开启后提示词多一段，支持的厂商带上推理参数', async () => {
    let sentParams: Record<string, unknown> | undefined
    let system = ''
    const result = await runAssistant({
      config: { ...CONFIG, providerId: 'qwen' },
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      reasoning: true,
      request: async (request) => {
        sentParams = request.params
        system = String(request.messages[0]?.content ?? '')
        return transport(body({ content: '好的。' }))
      },
    })
    expect(result.ok).toBe(true)
    expect(system).toContain('【深度思考】')
    expect(sentParams).toEqual({ enable_thinking: true })
  })

  it('关闭时不带参数，提示词也没有那一段', async () => {
    let sentParams: Record<string, unknown> | undefined
    let system = ''
    await runAssistant({
      config: { ...CONFIG, providerId: 'qwen' },
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request: async (request) => {
        sentParams = request.params
        system = String(request.messages[0]?.content ?? '')
        return transport(body({ content: '好的。' }))
      },
    })
    expect(sentParams).toBeUndefined()
    expect(system).not.toContain('【深度思考】')
  })

  it('不认识推理参数的厂商不瞎传字段', async () => {
    let sentParams: Record<string, unknown> | undefined
    await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      reasoning: true,
      request: async (request) => {
        sentParams = request.params
        return transport(body({ content: '好的。' }))
      },
    })
    expect(sentParams).toBeUndefined()
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

  it('写工具只生成待确认动作，不直接写库', async () => {
    let round = 0
    const result = await runAssistant({
      config: CONFIG,
      history: [{ role: 'user', content: '午饭 28 块，记一下' }],
      data: emptyData(),
      today: '2026-10-28',
      now: Date.UTC(2026, 9, 28, 4, 0),
      request: async () => {
        round += 1
        if (round === 1) {
          return transport(
            body({
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'add_finance',
                    arguments: '{"name":"午饭","amount":28,"direction":"expense"}',
                  },
                },
              ],
            }),
          )
        }
        return transport(body({ content: '确认后我就把午饭记成 28 元支出。' }))
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reply).toContain('确认')
      expect(result.steps).toHaveLength(0)
      expect(result.pending).toEqual([
        {
          kind: 'finance',
          dateKey: '2026-10-28',
          direction: 'expense',
          name: '午饭',
          amount: 28,
          note: '',
          category: '',
        },
      ])
    }
  })

  it('写工具参数不对时把原因回给模型，不生成卡片', async () => {
    let round = 0
    let lastToolResult = ''
    const result = await runAssistant({
      config: CONFIG,
      history: [],
      data: emptyData(),
      today: '2026-10-28',
      request: async (request) => {
        round += 1
        if (round === 1) {
          return transport(
            body({
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'add_finance', arguments: '{"name":"午饭","amount":-5}' },
                },
              ],
            }),
          )
        }
        lastToolResult = String(request.messages.at(-1)?.content ?? '')
        return transport(body({ content: '金额好像不对，是多少钱？' }))
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.pending).toBeUndefined()
    expect(lastToolResult).toContain('金额')
  })
})
