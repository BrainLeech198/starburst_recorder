export interface AchievementCardFact {
  label: string
  value: string
}

export interface AchievementCardInput {
  title: string
  dateLabel: string
  facts: AchievementCardFact[]
  tone: 'training' | 'review'
}

const WIDTH = 1080
const HEIGHT = 1350
const PALETTES = {
  training: { start: '#e7f5ef', end: '#e8f0ff', accent: '#25856c', panel: '#f1f8f4' },
  review: { start: '#fff3df', end: '#eeeaff', accent: '#a66a32', panel: '#fff8ed' },
} as const

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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
  let line = ''
  for (const character of Array.from(text)) {
    const next = line + character
    if (line && context.measureText(next).width > maxWidth) {
      result.push(line)
      line = character
    } else line = next
  }
  if (line) result.push(line)
  return result
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('postcard PNG encoding failed')), 'image/png')
  })
}

/** Render a local-only, photo-free achievement card for training and period reviews. */
export async function renderAchievementCardImage(input: AchievementCardInput, appName: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('postcard canvas unavailable')

  const palette = PALETTES[input.tone]
  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT)
  background.addColorStop(0, palette.start)
  background.addColorStop(1, palette.end)
  context.fillStyle = background
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.save()
  context.shadowColor = 'rgba(35, 42, 58, 0.14)'
  context.shadowBlur = 32
  context.shadowOffsetY = 12
  roundedRect(context, 54, 54, WIDTH - 108, HEIGHT - 108, 40)
  context.fillStyle = '#ffffff'
  context.fill()
  context.restore()

  context.save()
  roundedRect(context, 54, 54, WIDTH - 108, HEIGHT - 108, 40)
  context.clip()
  context.fillStyle = palette.accent
  context.fillRect(54, 54, WIDTH - 108, 18)
  context.restore()

  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(144, 140, 10, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#737486'
  context.font = '600 27px system-ui, sans-serif'
  context.textBaseline = 'top'
  context.fillText(appName, 172, 122, 760)

  roundedRect(context, 112, 185, 300, 48, 24)
  context.fillStyle = palette.panel
  context.fill()
  context.fillStyle = palette.accent
  context.font = '600 23px system-ui, sans-serif'
  context.fillText(input.dateLabel, 134, 197, 256)

  context.fillStyle = '#202334'
  context.font = '700 62px system-ui, sans-serif'
  const titleLines = wrapText(context, input.title.trim() || appName, 856).slice(0, 2)
  let titleY = 290
  for (const line of titleLines) {
    context.fillText(line, 112, titleY, 856)
    titleY += 78
  }

  const panelTop = 455
  const panelHeight = 690
  roundedRect(context, 94, panelTop, 892, panelHeight, 30)
  context.fillStyle = palette.panel
  context.fill()
  context.fillStyle = palette.accent
  roundedRect(context, 112, panelTop + 26, 8, panelHeight - 52, 4)
  context.fill()

  const facts = input.facts.slice(0, 7)
  const rowHeight = Math.min(128, (panelHeight - 70) / Math.max(1, facts.length))
  let y = panelTop + 40
  context.textBaseline = 'top'
  for (const [index, fact] of facts.entries()) {
    if (index > 0) {
      context.strokeStyle = 'rgba(72, 83, 96, 0.12)'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(152, y - 13)
      context.lineTo(946, y - 13)
      context.stroke()
    }
    context.fillStyle = '#777889'
    context.font = '500 23px system-ui, sans-serif'
    context.fillText(fact.label, 152, y, 760)
    context.fillStyle = '#2d3440'
    context.font = '600 31px system-ui, sans-serif'
    const valueLines = wrapText(context, fact.value, 760).slice(0, 2)
    let valueY = y + 34
    for (const line of valueLines) {
      context.fillText(line, 152, valueY, 760)
      valueY += 38
    }
    y += rowHeight
  }

  context.strokeStyle = '#e8e7ed'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(112, 1190)
  context.lineTo(968, 1190)
  context.stroke()
  context.fillStyle = '#777889'
  context.font = '500 24px system-ui, sans-serif'
  context.fillText(appName, 112, 1222)

  const blob = await canvasBlob(canvas)
  return new Uint8Array(await blob.arrayBuffer())
}
