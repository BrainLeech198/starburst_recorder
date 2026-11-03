/**
 * 附件：读文件、压图片、拼进对话。
 *
 * 只有两类附件：图片（发给能看图的模型）和纯文本（直接拼进正文）。
 * 图片压到最长边 1280、JPEG 0.75，再存 dataURL——对话存档在 localStorage 里，
 * 原图一张就能把配额吃满。
 */
import type { ChatContentPart } from '@/platform/desktop'
import { translate } from '@/shared/i18n/context'
import type { ChatAttachment } from './assistantChatStore'

/** 一条消息最多带几个附件 */
export const MAX_ATTACHMENTS = 3
/** 图片最长边 */
const MAX_IMAGE_SIDE = 1280
/** 压缩后的 dataURL 上限，超过就请用户换一张 */
const MAX_DATA_URL_CHARS = 2_400_000
/** 文本附件只留前面这么多字 */
const MAX_TEXT_CHARS = 6_000

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read'))
    reader.readAsText(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image'))
    image.src = src
  })
}

/** 把一张图片缩到最长边 1280 并转成 JPEG；画布拿不到就退回原图 */
async function compressImage(file: File) {
  const original = await readAsDataUrl(file)
  const image = await loadImage(original).catch(() => null)
  if (!image) throw new Error(translate('assistant.attachFailed'))
  try {
    const side = Math.max(image.width, image.height)
    if (side <= MAX_IMAGE_SIDE && original.length <= MAX_DATA_URL_CHARS) return original
    const scale = Math.min(1, MAX_IMAGE_SIDE / side)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.75)
  } catch {
    return original
  }
}

function isTextFile(file: File) {
  if (file.type.startsWith('text/')) return true
  if (file.type === 'application/json') return true
  return /\.(txt|md|markdown|json|csv|log|yml|yaml)$/i.test(file.name)
}

/**
 * 读一个用户选的文件。
 * 读不了或太大时抛出一句能直接弹给用户的话。
 */
export async function readAttachment(file: File): Promise<ChatAttachment> {
  if (file.type.startsWith('image/')) {
    const dataUrl = await compressImage(file)
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error(translate('assistant.attachTooBig'))
    return { name: file.name, dataUrl }
  }
  if (isTextFile(file)) {
    const text = (await readAsText(file)).trim()
    if (text === '') throw new Error(translate('assistant.attachFailed'))
    return {
      name: file.name,
      text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…（后面省略）` : text,
    }
  }
  throw new Error(translate('assistant.attachFailed'))
}

/** 文本附件拼成一段提示，接在用户原话后面 */
export function attachmentPromptText(attachments: ChatAttachment[]) {
  const files = attachments.filter((item) => typeof item.text === 'string' && item.text.trim() !== '')
  if (files.length === 0) return ''
  return `\n\n${files
    .map((item) => `【附件：${item.name}】\n${item.text ?? ''}`)
    .join('\n\n')}`
}

/** 图片附件转成 OpenAI 的 content parts */
export function imageParts(attachments: ChatAttachment[]): ChatContentPart[] {
  return attachments
    .filter((item) => typeof item.dataUrl === 'string' && item.dataUrl !== '')
    .map((item) => ({ type: 'image_url' as const, image_url: { url: item.dataUrl as string } }))
}
