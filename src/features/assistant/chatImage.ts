/**
 * 把一段助手对话画成一张长图。
 *
 * 用 canvas 逐行排版，不依赖 html2canvas；中文按字符换行，英文单词过宽时也能断开。
 * 配色固定成应用的深色主题，换主题不影响导出的可读性。
 * 图片过长时截断并注明，避免超出浏览器 canvas 高度上限。
 */
import { translate } from '@/shared/i18n/context'
import { describeAction } from './assistantActionBuild'
import type { ChatActionStatus, ChatMessageRecord } from './assistantChatStore'
import { exportTime, type ChatExportLabels } from './chatExport'

const WIDTH = 720
const PAD = 32
const MAX_HEIGHT = 16000
/**
 * 一张图的像素预算。桌面浏览器扛得住 720×16000 的 2 倍图，
 * 安卓 WebView 的 canvas 内存池小得多，超了会画成空白或者直接把 WebView 顶掉。
 * 按面积降采样，长图自动退到 1.5x / 1x，宁可略糊也不要导出失败。
 */
const MAX_PIXELS = 12_000_000
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif'

const COLORS = {
  bg: '#0b0f14',
  surface: '#141b24',
  line: '#263241',
  text: '#e8eef6',
  muted: '#93a1b3',
  brand: '#6ee7ff',
  danger: '#ff7b8a',
}

const STATUS_KEYS: Record<ChatActionStatus, Parameters<typeof translate>[0]> = {
  pending: 'assistant.action.pending',
  done: 'assistant.action.done',
  undone: 'assistant.action.undone',
  canceled: 'assistant.action.canceled',
  failed: 'assistant.action.failed',
}

type Row =
  | { kind: 'text'; text: string; font: string; color: string; height: number }
  | { kind: 'divider'; height: number }

export interface ChatImageInput {
  title: string
  messages: ChatMessageRecord[]
  includeTrace: boolean
  includeActions: boolean
  labels: ChatExportLabels
  now?: number
}

function font(size: number, weight = '400') {
  return `${weight} ${size}px ${FONT_FAMILY}`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    let line = ''
    for (const char of paragraph) {
      if (line !== '' && ctx.measureText(line + char).width > maxWidth) {
        out.push(line)
        line = char
      } else {
        line += char
      }
    }
    out.push(line)
  }
  return out
}

function textRow(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: { size?: number; weight?: string; color?: string; height?: number } = {},
): Row[] {
  const size = options.size ?? 15
  const weight = options.weight ?? '400'
  const height = options.height ?? Math.round(size * 1.6)
  // measureText 用的是当前 font；不先设好，窄屏换行会按默认 10px 算，画出来就溢出
  ctx.font = font(size, weight)
  const lines = wrap(ctx, text, WIDTH - PAD * 2)
  return lines.map((line) => ({
    kind: 'text' as const,
    text: line,
    font: font(size, weight),
    color: options.color ?? COLORS.text,
    height,
  }))
}

function smallRows(
  ctx: CanvasRenderingContext2D,
  text: string,
  color = COLORS.muted,
  size = 13,
): Row[] {
  return textRow(ctx, text, { size, color, height: Math.round(size * 1.55) })
}

/** 判断这一步是否值得画：只取前几行，避免一张图被工具结果撑爆 */
function stepText(step: { name: string; text: string }) {
  const first = step.text.split('\n').find((line) => line.trim() !== '') ?? ''
  const short = first.length > 160 ? `${first.slice(0, 160)}…` : first
  return `· ${step.name}${short === '' ? '' : `：${short}`}`
}

function messageRows(
  ctx: CanvasRenderingContext2D,
  item: ChatMessageRecord,
  input: ChatImageInput,
): Row[] {
  const rows: Row[] = []
  const role = item.role === 'user' ? input.labels.user : input.labels.assistant
  rows.push({
    kind: 'text',
    text: `${role} · ${exportTime(item.at)}`,
    font: font(13, '600'),
    color: item.role === 'user' ? COLORS.muted : COLORS.brand,
    height: 24,
  })

  if (item.content.trim() !== '') {
    rows.push(...textRow(ctx, item.content.trim(), { size: 15, height: 24 }))
  }
  if ((item.attachments ?? []).length > 0) {
    const names = (item.attachments ?? []).map((file) => file.name).join('、')
    rows.push(...smallRows(ctx, `${input.labels.attachments}: ${names}`))
  }

  if (input.includeTrace && (item.steps ?? []).length > 0) {
    rows.push(...smallRows(ctx, input.labels.tools, COLORS.brand))
    for (const step of item.steps ?? []) {
      rows.push(...smallRows(ctx, stepText(step)))
    }
  }

  if (input.includeActions && (item.actions ?? []).length > 0) {
    rows.push(...smallRows(ctx, input.labels.actions, COLORS.brand))
    for (const state of item.actions ?? []) {
      const status = translate(STATUS_KEYS[state.status])
      const detail = describeAction(state.action)
      rows.push(...smallRows(ctx, `${status} · ${detail}`, state.error ? COLORS.danger : COLORS.muted))
    }
  }

  rows.push({ kind: 'divider', height: 26 })
  return rows
}

/** 1x / 1.5x / 2x 三档：半档比连续缩放更不容易让文字发虚 */
function renderScale(cssHeight: number) {
  const fit = Math.sqrt(MAX_PIXELS / (WIDTH * cssHeight))
  return Math.max(1, Math.min(2, Math.floor(fit * 2) / 2))
}

/** 画图并返回 PNG；失败时抛错，由调用方提示 */
export async function renderChatImage(input: ChatImageInput): Promise<Blob> {
  const now = input.now ?? Date.now()
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('canvas unavailable')

  const rows: Row[] = []
  rows.push(...textRow(measure, input.title.trim() || input.labels.assistant, {
    size: 26,
    weight: '600',
    height: 42,
  }))
  rows.push(...smallRows(measure, `${input.labels.exportedAt}: ${exportTime(now)}`))
  rows.push({ kind: 'divider', height: 22 })

  for (const item of input.messages) {
    rows.push(...messageRows(measure, item, input))
  }

  rows.push(...smallRows(measure, '星芒记录者 · Starburst Recorder', COLORS.brand, 12))

  let cssHeight = PAD * 2
  const kept: Row[] = []
  let clipped = false
  for (const row of rows) {
    if (cssHeight + row.height > MAX_HEIGHT - 40) {
      clipped = true
      break
    }
    kept.push(row)
    cssHeight += row.height
  }
  if (clipped) {
    kept.push({
      kind: 'text',
      text: '…',
      font: font(12),
      color: COLORS.muted,
      height: 24,
    })
    cssHeight += 24
  }

  const scale = renderScale(cssHeight)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * scale
  canvas.height = cssHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.scale(scale, scale)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, WIDTH, cssHeight)

  let y = PAD
  for (const row of kept) {
    if (row.kind === 'divider') {
      const lineY = y + row.height / 2
      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD, lineY)
      ctx.lineTo(WIDTH - PAD, lineY)
      ctx.stroke()
    } else {
      ctx.font = row.font
      ctx.fillStyle = row.color
      ctx.textBaseline = 'top'
      ctx.fillText(row.text, PAD, y)
    }
    y += row.height
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('image encode failed'))
    }, 'image/png')
  })
}

export function chatImageFilename(now = Date.now()) {
  const date = new Date(now)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `starburst-chat-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.png`
}
