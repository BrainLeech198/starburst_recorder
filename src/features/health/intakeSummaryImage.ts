export interface IntakeSummaryImageInput {
  title: string
  dateLabel: string
  recordLabel: string
  appName: string
  kcalLabel: string
  proteinLabel: string
  carbsLabel: string
  fatLabel: string
  kcalValue: string
  proteinValue: string
  carbsValue: string
  fatValue: string
  records: Array<{ time: string; name: string; grams: string; kcal: string }>
}

const WIDTH = 1080
const CARD_INSET = 54
const FONT = 'system-ui, sans-serif'

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

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const character of Array.from(text)) {
    const next = line + character
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line)
      line = character
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('intake summary PNG encoding failed'))), 'image/png')
  })
}

/** Render a local-only daily food summary. Every recorded item remains visible in the image. */
export async function renderIntakeSummaryImage(input: IntakeSummaryImageInput): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  let context = canvas.getContext('2d')
  if (!context) throw new Error('intake summary canvas unavailable')

  context.font = `500 27px ${FONT}`
  const rows = input.records.map((record) => {
    const text = `${record.time} · ${record.name} · ${record.grams} g · ${record.kcal} kcal`
    return wrapText(context!, text, 820)
  })
  const rowHeights = rows.map((lines) => Math.max(78, 26 + lines.length * 38))
  const recordsTop = 790
  const height = Math.max(1420, recordsTop + 96 + rowHeights.reduce((total, row) => total + row, 0) + 120)
  canvas.height = height
  context = canvas.getContext('2d')
  if (!context) throw new Error('intake summary canvas unavailable')

  const background = context.createLinearGradient(0, 0, WIDTH, height)
  background.addColorStop(0, '#fff0de')
  background.addColorStop(1, '#f5f2e9')
  context.fillStyle = background
  context.fillRect(0, 0, WIDTH, height)

  context.save()
  context.shadowColor = 'rgba(35, 42, 58, 0.14)'
  context.shadowBlur = 32
  context.shadowOffsetY = 12
  roundedRect(context, CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, height - CARD_INSET * 2, 40)
  context.fillStyle = '#ffffff'
  context.fill()
  context.restore()

  context.save()
  roundedRect(context, CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, height - CARD_INSET * 2, 40)
  context.clip()
  context.fillStyle = '#b77935'
  context.fillRect(CARD_INSET, CARD_INSET, WIDTH - CARD_INSET * 2, 18)
  context.restore()

  context.fillStyle = '#737486'
  context.font = `600 27px ${FONT}`
  context.textBaseline = 'top'
  context.fillText(input.appName, 112, 118, 856)

  roundedRect(context, 112, 174, 420, 54, 27)
  context.fillStyle = '#fff4e9'
  context.fill()
  context.fillStyle = '#a65f2d'
  context.font = `600 24px ${FONT}`
  context.fillText(input.dateLabel, 138, 188, 370)

  context.fillStyle = '#202334'
  context.font = `700 58px ${FONT}`
  context.fillText(input.title, 112, 276, 850)

  const metrics = [
    { label: input.kcalLabel, value: input.kcalValue },
    { label: input.proteinLabel, value: input.proteinValue },
    { label: input.carbsLabel, value: input.carbsValue },
    { label: input.fatLabel, value: input.fatValue },
  ]
  metrics.forEach((metric, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 94 + column * 452
    const y = 374 + row * 176
    roundedRect(context!, x, y, 438, 158, 24)
    context!.fillStyle = '#fff7ee'
    context!.fill()
    context!.fillStyle = '#777889'
    context!.font = `500 24px ${FONT}`
    context!.fillText(metric.label, x + 28, y + 26, 382)
    context!.fillStyle = '#2d3440'
    context!.font = `700 42px ${FONT}`
    context!.fillText(metric.value, x + 28, y + 76, 382)
  })

  roundedRect(context, 94, recordsTop, 892, height - recordsTop - 112, 28)
  context.fillStyle = '#fbf8f3'
  context.fill()
  context.fillStyle = '#a65f2d'
  context.font = `600 25px ${FONT}`
  context.fillText(input.recordLabel, 126, recordsTop + 28, 820)

  let y = recordsTop + 82
  rows.forEach((lines, index) => {
    context!.fillStyle = '#2d3440'
    context!.font = `500 27px ${FONT}`
    lines.forEach((line, lineIndex) => {
      context!.fillText(line, 126, y + lineIndex * 38, 820)
    })
    y += rowHeights[index]
    if (index < rows.length - 1) {
      context!.strokeStyle = 'rgba(72, 83, 96, 0.12)'
      context!.lineWidth = 2
      context!.beginPath()
      context!.moveTo(126, y - 10)
      context!.lineTo(954, y - 10)
      context!.stroke()
    }
  })

  context.fillStyle = '#777889'
  context.font = `500 24px ${FONT}`
  context.fillText(input.appName, 112, height - 104, 856)

  const blob = await canvasBlob(canvas)
  return new Uint8Array(await blob.arrayBuffer())
}
