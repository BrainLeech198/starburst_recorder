import { describe, expect, it } from 'vitest'
import type { ChatMessageRecord } from './assistantChatStore'
import { buildChatCopy, buildChatExport, chatExportFilename } from './chatExport'

const LABELS = {
  user: '我',
  assistant: '星芒',
  tools: '工具调用轨迹',
  actions: '动作卡片',
  attachments: '附件',
  exportedAt: '导出时间',
}

const MESSAGES: ChatMessageRecord[] = [
  { id: 'u1', role: 'user', content: '记一下午饭 28 块', at: 1762000000000 },
  {
    id: 'a1',
    role: 'assistant',
    content: '已经准备好一张卡片。',
    at: 1762000060000,
    steps: [{ name: 'query_day', text: '查到 1 条记录' }],
    actions: [
      {
        action: { kind: 'memory', text: '不吃香菜', memoryKind: 'preference' },
        status: 'done',
      },
    ],
  },
]

function build(overrides: Partial<Parameters<typeof buildChatExport>[0]> = {}) {
  return buildChatExport({
    title: '午饭',
    messages: MESSAGES,
    format: 'md',
    includeTrace: false,
    includeActions: false,
    labels: LABELS,
    now: 1762000100000,
    ...overrides,
  })
}

describe('对话导出', () => {
  it('Markdown 带角色、正文与导出时间，默认不写工具和动作', () => {
    const text = build()
    expect(text).toContain('# 午饭')
    expect(text).toContain('我')
    expect(text).toContain('星芒')
    expect(text).toContain('记一下午饭 28 块')
    expect(text).toContain('已经准备好一张卡片。')
    expect(text).toContain('导出时间')
    expect(text).not.toContain('query_day')
    expect(text).not.toContain('不吃香菜')
  })

  it('勾选后把工具轨迹和动作卡片一起带上', () => {
    const text = build({ includeTrace: true, includeActions: true })
    expect(text).toContain('query_day')
    expect(text).toContain('工具调用轨迹')
    expect(text).toContain('不吃香菜')
  })

  it('纯文本按时间和角色分行', () => {
    const text = build({ format: 'txt' })
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] 我/)
    expect(text).toContain('我')
    expect(text).toContain('星芒')
    expect(text).not.toContain('# 午饭')
  })

  it('JSON 可以解析，轨迹按勾选决定是否包含', () => {
    const bare = JSON.parse(build({ format: 'json' })) as {
      title: string
      messages: { role: string; steps?: unknown }[]
    }
    expect(bare.title).toBe('午饭')
    expect(bare.messages).toHaveLength(2)
    expect(bare.messages[1].steps).toBeUndefined()

    const full = JSON.parse(build({ format: 'json', includeTrace: true })) as {
      messages: { steps?: { name: string }[] }[]
    }
    expect(full.messages[1].steps?.[0].name).toBe('query_day')
  })

  it('批量复制只带角色和正文', () => {
    const text = buildChatCopy(MESSAGES, LABELS)
    expect(text).toBe('我：记一下午饭 28 块\n\n星芒：已经准备好一张卡片。')
  })

  it('文件名带时间戳和对应扩展名', () => {
    const name = chatExportFilename('md', 1762000100000)
    expect(name).toMatch(/^starburst-chat-\d{8}-\d{4}\.md$/)
  })
})
