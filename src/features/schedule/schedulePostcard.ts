import type { ScheduleItem } from '@/core/db/schema'
import type { Translate } from '@/shared/i18n/context'
import { isDoneOn, occurrencesOn } from './scheduleMath'

export interface DailyPostcardEntry {
  title: string
  note: string
  photoDataUrl: string | null
}

export interface DailyPostcardData {
  dateKey: string
  done: number
  total: number
  entries: DailyPostcardEntry[]
}

/** 从所选日期的日程中汇总已完成任务，明信片不另存一份派生数据。 */
export function buildDailyPostcardData(items: ScheduleItem[], dateKey: string): DailyPostcardData {
  const dailyItems = occurrencesOn(items, dateKey)
  const completed = dailyItems.filter((item) => isDoneOn(item, dateKey))
  return {
    dateKey,
    done: completed.length,
    total: dailyItems.length,
    entries: completed.map((item) => {
      const checkIn = (item.checkIns ?? []).find((value) => value.dateKey === dateKey)
      return {
        title: item.title,
        note: checkIn?.note ?? '',
        photoDataUrl: checkIn?.photo?.dataUrl ?? null,
      }
    }),
  }
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
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const character of Array.from(paragraph)) {
      const next = line + character
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line)
        line = character
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

/** Canvas 导出 1080px 宽的竖版 PNG，手机上也能直接转发。 */
export async function renderDailyPostcard(data: DailyPostcardData, dateLabel: string, t: Translate): Promise<Uint8Array> {
  const visibleEntries = data.entries.slice(0, 8)
  const photoEntries = data.entries.filter((entry) => entry.photoDataUrl).slice(0, 4)
  const photos = (await Promise.all(photoEntries.map(async (entry) => ({
    title: entry.title,
    image: await loadImage(entry.photoDataUrl!),
  })))).filter((photo): photo is { title: string; image: HTMLImageElement } => photo.image !== null)
  const photoRows = Math.ceil(photos.length / 2)
  const hiddenPhotoCount = Math.max(0, data.entries.filter((entry) => entry.photoDataUrl).length - photos.length)
  const photoHeight = photos.length > 0 ? photoRows * 202 + 78 : 0
  const height = 600 + visibleEntries.length * 150 + photoHeight + (data.entries.length > 8 ? 72 : 0)
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('postcard canvas unavailable')

  const background = context.createLinearGradient(0, 0, 1080, height)
  background.addColorStop(0, '#f4f0ff')
  background.addColorStop(1, '#eaf6f2')
  context.fillStyle = background
  context.fillRect(0, 0, 1080, height)

  context.save()
  context.shadowColor = 'rgba(39, 35, 69, 0.14)'
  context.shadowBlur = 32
  context.shadowOffsetY = 12
  roundedRect(context, 48, 48, 984, height - 96, 42)
  context.fillStyle = '#fff'
  context.fill()
  context.restore()
  context.save()
  roundedRect(context, 48, 48, 984, height - 96, 42)
  context.clip()
  context.fillStyle = '#7466dc'
  context.fillRect(48, 48, 984, 16)
  context.restore()

  context.fillStyle = '#7466dc'
  context.font = '700 22px system-ui, sans-serif'
  context.textBaseline = 'top'
  context.fillText(t('schedule.postcard.eyebrow'), 104, 104)

  context.fillStyle = '#25263a'
  context.font = '700 68px system-ui, sans-serif'
  context.fillText(dateLabel, 104, 152, 870)

  roundedRect(context, 104, 252, 872, 106, 28)
  context.fillStyle = '#f2f0ff'
  context.fill()
  context.fillStyle = '#594dc4'
  context.font = '650 34px system-ui, sans-serif'
  context.fillText(t('schedule.postcard.progress', { done: data.done, total: data.total }), 136, 286, 800)

  context.fillStyle = '#202334'
  context.font = '650 30px system-ui, sans-serif'
  context.fillText(t('schedule.postcard.completedHeading' as never), 104, 402)

  let y = 462
  context.font = '600 30px system-ui, sans-serif'
  for (const entry of visibleEntries) {
    context.fillStyle = '#7568dc'
    context.beginPath()
    context.arc(119, y + 14, 8, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#303146'
    context.fillText(entry.title, 148, y, 820)
    y += 42
    if (entry.note.trim()) {
      context.fillStyle = '#6e6c7b'
      context.font = '400 24px system-ui, sans-serif'
      const lines = wrapText(context, entry.note, 810).slice(0, 2)
      for (const line of lines) {
        context.fillText(line, 148, y, 820)
        y += 32
      }
      context.font = '600 30px system-ui, sans-serif'
    }
    y = Math.max(y + 28, 462 + (visibleEntries.indexOf(entry) + 1) * 150)
  }

  if (data.entries.length > 8) {
    context.fillStyle = '#777486'
    context.font = '500 23px system-ui, sans-serif'
    context.fillText(t('schedule.postcard.more', { count: data.entries.length - 8 }), 148, y)
    y += 52
  }

  if (photos.length > 0) {
    const photoTop = y + 12
    for (const [index, photo] of photos.entries()) {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = 104 + column * 444
      const tileY = photoTop + row * 202
      const tileWidth = 428
      const imageHeight = 152
      roundedRect(context, x, tileY, tileWidth, imageHeight, 20)
      context.save()
      context.clip()
      const scale = Math.max(tileWidth / photo.image.naturalWidth, imageHeight / photo.image.naturalHeight)
      const width = photo.image.naturalWidth * scale
      const renderedHeight = photo.image.naturalHeight * scale
      context.drawImage(photo.image, x + (tileWidth - width) / 2, tileY + (imageHeight - renderedHeight) / 2, width, renderedHeight)
      context.restore()
      context.fillStyle = '#737181'
      context.font = '500 20px system-ui, sans-serif'
      context.fillText(photo.title, x + 4, tileY + 162, tileWidth - 8)
    }
    if (hiddenPhotoCount > 0) {
      context.fillStyle = '#777486'
      context.font = '500 20px system-ui, sans-serif'
      context.fillText(t('schedule.postcard.photosMore', { count: hiddenPhotoCount }), 104, photoTop + photoRows * 202)
    }
  }

  context.fillStyle = '#858292'
  context.font = '500 22px system-ui, sans-serif'
  context.fillText(t('schedule.postcard.footer'), 104, height - 108, 872)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('postcard PNG encoding failed')), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
