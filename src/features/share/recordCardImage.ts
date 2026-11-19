import type { Translate } from '@/shared/i18n/context'
import { getShareAdapter } from './shareAdapters'
import type { ShareDoc, ShareKind } from './shareCode'

const WIDTH = 1080
const HEIGHT = 1350
const CARD_INSET = 56
const TEXT_LEFT = 112
const TEXT_WIDTH = WIDTH - TEXT_LEFT * 2
const BODY_MAX_LINES = 10

const CARD_THEMES: Record<ShareKind, { accent: string; panel: string; start: string; end: string }> = {
  diary: { accent: '#765acb', panel: '#f6f1ff', start: '#f5efff', end: '#eaf4f2' },
  stamp: { accent: '#4f7b91', panel: '#eef6f8', start: '#eaf5f7', end: '#f7f0e8' },
  food: { accent: '#4b8557', panel: '#eff7ef', start: '#edf6e9', end: '#fff4df' },
  meal: { accent: '#b66a37', panel: '#fff4e9', start: '#fff0dc', end: '#f4f1e9' },
  intake: { accent: '#b77935', panel: '#fff6e9', start: '#fff0de', end: '#f8f1e9' },
  finance: { accent: '#427f8c', panel: '#edf6f7', start: '#e9f3f5', end: '#eff3ff' },
  aiModel: { accent: '#6657d8', panel: '#f7f6ff', start: '#f1efff', end: '#e9f5f1' },
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = []
  const paragraphs = text.split(/\r?\n/)

  for (const paragraph of paragraphs) {
    let line = ''
    for (const character of Array.from(paragraph)) {
      const candidate = line + character
      if (line && context.measureText(candidate).width > maxWidth) {
        result.push(line)
        line = character
      } else {
        line = candidate
      }
    }
    result.push(line)
  }

  return result
}

function clampLines(lines: string[], limit: number, context: CanvasRenderingContext2D, maxWidth: number) {
  if (lines.length <= limit) return lines
  const visible = lines.slice(0, limit)
  let last = visible[limit - 1].trimEnd()
  while (last && context.measureText(`${last}…`).width > maxWidth) {
    last = Array.from(last).slice(0, -1).join('')
  }
  visible[limit - 1] = `${last}…`
  return visible
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('record card PNG encoding failed'))
    }, 'image/png')
  })
}

function coverOf(doc: ShareDoc): string | null {
  if (doc.kind === 'diary' || doc.kind === 'stamp') return doc.data.images[0]?.dataUrl ?? null
  if (doc.kind === 'food') return doc.data.photo
  if (doc.kind === 'meal') return doc.data.photo ?? doc.data.items.find((item) => item.food.photo)?.food.photo ?? null
  if (doc.kind === 'finance') return doc.data.photo
  return null
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('share card image unavailable'))
    image.src = source
  })
}

async function drawCover(
  context: CanvasRenderingContext2D,
  source: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const image = await loadImage(source)
  context.save()
  roundedRect(context, x, y, width, height, 28)
  context.clip()
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
  context.restore()
}

/** Render a compact, text-first image from the same localized preview used for sharing. */
export async function renderRecordCardImage(doc: ShareDoc, t: Translate): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('record card canvas unavailable')
  const theme = CARD_THEMES[doc.kind]
  const cover = coverOf(doc)

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT)
  background.addColorStop(0, theme.start)
  background.addColorStop(1, theme.end)
  context.fillStyle = background
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.save()
  context.shadowColor = 'rgba(36, 34, 64, 0.12)'
  context.shadowBlur = 30
  context.shadowOffsetY = 12
  roundedRect(context, CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, HEIGHT - CARD_INSET * 2, 38)
  context.fillStyle = '#ffffff'
  context.fill()
  context.restore()

  context.save()
  roundedRect(context, CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, HEIGHT - CARD_INSET * 2, 38)
  context.clip()
  context.fillStyle = theme.accent
  context.fillRect(CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, 18)
  context.restore()

  context.fillStyle = theme.accent
  context.beginPath()
  context.arc(TEXT_LEFT + 9, 134, 9, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#747184'
  context.font = '600 26px system-ui, sans-serif'
  context.textBaseline = 'top'
  context.fillText(t('app.name'), TEXT_LEFT + 32, 116)

  const date = doc.kind === 'diary' || doc.kind === 'stamp' || doc.kind === 'intake' || doc.kind === 'finance'
    ? doc.data.dateKey
    : ''
  if (date) {
    roundedRect(context, TEXT_LEFT, 166, 220, 42, 21)
    context.fillStyle = theme.panel
    context.fill()
    context.fillStyle = theme.accent
    context.font = '600 22px system-ui, sans-serif'
    context.fillText(date, TEXT_LEFT + 18, 176, 184)
  }

  const title = doc.title.trim() || t('app.name')
  context.fillStyle = '#202334'
  context.font = '700 58px system-ui, sans-serif'
  const titleLines = clampLines(wrapText(context, title, TEXT_WIDTH), 2, context, TEXT_WIDTH)
  let y = date ? 236 : 206
  for (const line of titleLines) {
    context.fillText(line, TEXT_LEFT, y, TEXT_WIDTH)
    y += 76
  }

  if (cover) {
    try {
      await drawCover(context, cover, TEXT_LEFT - 18, 420, TEXT_WIDTH + 36, 300)
    } catch {
      // Keep the text card usable when an optional or older image cannot be decoded.
    }
  }

  y += 24
  const panelTop = cover ? 760 : y
  const panelBottom = HEIGHT - 222
  const panelHeight = panelBottom - panelTop
  context.strokeStyle = '#e9e8f1'
  context.lineWidth = 2
  context.beginPath()
  if (!cover) {
    context.moveTo(TEXT_LEFT, y)
    context.lineTo(WIDTH - TEXT_LEFT, y)
    context.stroke()
  }
  const previewLines = getShareAdapter(doc).preview(doc, t)
    .map((line) => line.replace(/\[\[share-image:\d+\]\]/g, '').trim())
    .filter(Boolean)
  context.font = '400 34px system-ui, sans-serif'
  const bodyLines = previewLines.flatMap((line) => wrapText(context, line, TEXT_WIDTH))
  roundedRect(context, TEXT_LEFT - 18, panelTop, TEXT_WIDTH + 36, panelHeight, 28)
  context.fillStyle = theme.panel
  context.fill()
  roundedRect(context, TEXT_LEFT - 18, panelTop + 22, 8, panelHeight - 44, 4)
  context.fillStyle = theme.accent
  context.fill()

  context.fillStyle = '#414354'
  context.font = '400 34px system-ui, sans-serif'
  const bodyAvailableHeight = panelHeight - 64
  const availableLines = Math.max(1, Math.min(BODY_MAX_LINES, Math.floor(bodyAvailableHeight / 52)))
  const visibleLines = clampLines(bodyLines, availableLines, context, TEXT_WIDTH)
  y = panelTop + 32
  if (visibleLines.length <= 5) y += Math.max(0, (bodyAvailableHeight - visibleLines.length * 52) / 2)
  for (const line of visibleLines) {
    context.fillText(line, TEXT_LEFT, y, TEXT_WIDTH)
    y += 52
  }

  context.strokeStyle = '#e9e8f1'
  context.beginPath()
  context.moveTo(TEXT_LEFT, HEIGHT - 192)
  context.lineTo(WIDTH - TEXT_LEFT, HEIGHT - 192)
  context.stroke()
  context.fillStyle = '#7d7a8a'
  context.font = '500 24px system-ui, sans-serif'
  context.fillText(t('app.name'), TEXT_LEFT, HEIGHT - 154)

  const blob = await toBlob(canvas)
  return new Uint8Array(await blob.arrayBuffer())
}
