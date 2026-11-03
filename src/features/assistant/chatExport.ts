/**
 * 把一段助手对话变成可以直接拿走的文本。
 *
 * 纯函数：不碰存储、不弹窗，方便单测；界面只负责选格式、勾选项和保存。
 * 附件只带文件名，不带 dataURL——导出的是一份能读的记录，不是备份文件。
 */
import { translate } from '@/shared/i18n/context'
import { describeAction } from './assistantActionBuild'
import type { ChatActionStatus, ChatMessageRecord } from './assistantChatStore'

export type ChatExportFormat = 'md' | 'txt' | 'json'

export interface ChatExportLabels {
  user: string
  assistant: string
  tools: string
  actions: string
  attachments: string
  exportedAt: string
}

export interface ChatExportInput {
  title: string
  messages: ChatMessageRecord[]
  format: ChatExportFormat
  includeTrace: boolean
  includeActions: boolean
  labels: ChatExportLabels
  /** 测试时固定时间 */
  now?: number
}

const STATUS_KEYS: Record<ChatActionStatus, Parameters<typeof translate>[0]> = {
  pending: 'assistant.action.pending',
  done: 'assistant.action.done',
  undone: 'assistant.action.undone',
  canceled: 'assistant.action.canceled',
  failed: 'assistant.action.failed',
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 本地时间，「2026-11-03 12:04」；导出和人看都够用 */
export function exportTime(at: number) {
  const date = new Date(at)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function attachmentLine(item: ChatMessageRecord, labels: ChatExportLabels) {
  const names = (item.attachments ?? []).map((file) => file.name).filter(Boolean)
  return names.length > 0 ? `${labels.attachments}: ${names.join('、')}` : ''
}

function actionLines(item: ChatMessageRecord) {
  return (item.actions ?? []).map((state) => {
    const status = translate(STATUS_KEYS[state.status])
    return `${status} · ${describeAction(state.action)}${state.error ? `（${state.error}）` : ''}`
  })
}

function traceLines(item: ChatMessageRecord) {
  return (item.steps ?? []).map((step) => `${step.name}\n${step.text}`)
}

function markdownBody(item: ChatMessageRecord, input: ChatExportInput) {
  const { labels } = input
  const blocks: string[] = []
  const role = item.role === 'user' ? labels.user : labels.assistant
  blocks.push(`### ${role} · ${exportTime(item.at)}`)

  if (item.content.trim() !== '') blocks.push(item.content.trim())
  const attachments = attachmentLine(item, labels)
  if (attachments !== '') blocks.push(attachments)

  const traces = input.includeTrace ? traceLines(item) : []
  if (traces.length > 0) {
    blocks.push(
      `<details>\n<summary>${labels.tools}（${traces.length}）</summary>\n\n${traces
        .map((text) => `- ${text.replace(/\n/g, '\n  ')}`)
        .join('\n')}\n\n</details>`,
    )
  }

  const actions = input.includeActions ? actionLines(item) : []
  if (actions.length > 0) {
    blocks.push(`**${labels.actions}**\n\n${actions.map((text) => `- ${text}`).join('\n')}`)
  }

  return blocks.join('\n\n')
}

function textBody(item: ChatMessageRecord, input: ChatExportInput) {
  const { labels } = input
  const role = item.role === 'user' ? labels.user : labels.assistant
  const lines: string[] = [`[${exportTime(item.at)}] ${role}`]
  if (item.content.trim() !== '') lines.push(item.content.trim())
  const attachments = attachmentLine(item, labels)
  if (attachments !== '') lines.push(attachments)

  if (input.includeTrace) {
    for (const step of item.steps ?? []) {
      lines.push(`  [${labels.tools}] ${step.name}`)
      lines.push(...step.text.split('\n').map((line) => `    ${line}`))
    }
  }
  if (input.includeActions) {
    for (const action of actionLines(item)) lines.push(`  [${labels.actions}] ${action}`)
  }
  return lines.join('\n')
}

function jsonValue(item: ChatMessageRecord, input: ChatExportInput) {
  return {
    role: item.role,
    at: new Date(item.at).toISOString(),
    content: item.content,
    ...(item.attachments && item.attachments.length > 0
      ? { attachments: item.attachments.map((file) => file.name) }
      : {}),
    ...(input.includeTrace && item.steps && item.steps.length > 0
      ? { steps: item.steps }
      : {}),
    ...(input.includeActions && item.actions && item.actions.length > 0
      ? {
          actions: item.actions.map((state) => ({
            status: state.status,
            description: describeAction(state.action),
            ...(state.error ? { error: state.error } : {}),
          })),
        }
      : {}),
  }
}

/** 生成导出正文；选中哪些消息由调用方先筛好 */
export function buildChatExport(input: ChatExportInput): string {
  const now = input.now ?? Date.now()
  if (input.format === 'json') {
    return JSON.stringify(
      {
        title: input.title,
        exportedAt: new Date(now).toISOString(),
        messages: input.messages.map((item) => jsonValue(item, input)),
      },
      null,
      2,
    )
  }

  if (input.format === 'txt') {
    const head = [input.title, `${input.labels.exportedAt}: ${exportTime(now)}`].join('\n')
    return [head, ...input.messages.map((item) => textBody(item, input))].join('\n\n')
  }

  const head = [
    `# ${input.title}`,
    `> ${input.labels.exportedAt}: ${exportTime(now)}`,
  ].join('\n\n')
  return [head, ...input.messages.map((item) => markdownBody(item, input))].join('\n\n---\n\n')
}

/** 批量复制：只带角色和正文，够贴到别处继续用 */
export function buildChatCopy(messages: ChatMessageRecord[], labels: ChatExportLabels): string {
  return messages
    .filter((item) => item.content.trim() !== '')
    .map((item) => `${item.role === 'user' ? labels.user : labels.assistant}：${item.content.trim()}`)
    .join('\n\n')
}

export function chatExportFilename(format: ChatExportFormat, now = Date.now()) {
  const date = new Date(now)
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  return `starburst-chat-${stamp}.${format}`
}
