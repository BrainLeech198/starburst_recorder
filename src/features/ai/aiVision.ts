/**
 * 手写日记 → 文字。
 *
 * 两件事分开写在两个函数里：
 *   1. compressImage：手机拍的照片动辄好几 MB，先缩到长边 1600、转成 JPEG，再发给模型
 *   2. transcribeDiary：把压缩后的图交给模型，要求它只转写、不润色
 *
 * 原图不存：日记本身是纯文本，这张图只是一次性的输入。
 */
import type { ChatContentPart } from '@/platform/desktop'
import { chat, explainFailure, pickReply } from './aiClient'
import type { AiConfig } from './aiConfig'

/** 长边上限：再大模型也看不清更多细节，只是白白多花 token 和流量 */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/** 读出图片的原始尺寸；用完就把 objectURL 放掉 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('这张图片读不出来，换一张试试。'))
    }
    image.src = url
  })
}

/**
 * 压成可以直接塞进请求的 dataURL。
 * 白底是有意的：手写的透明 PNG 转 JPEG 时，透明部分会变黑，字就看不见了。
 */
export async function compressImage(file: File): Promise<string> {
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('这台设备画不出图片，换个浏览器或者用桌面版试试。')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

const SYSTEM_PROMPT = `你负责把一张手写日记的照片，原样转成文字。

规矩：
- 只转写照片上真实存在的字，不要润色、不要改写、不要补写，也不要合并或拆分句子
- 保留原来的自然段和换行；每段直接开始，段首不要加任何符号
- 看不清的字用「□」代替，不要猜；一整句都看不清就写「（这一句看不清）」
- 照片最上方的日期、星期、天气、页码，不要写进正文
- 不要标题、不要 Markdown 符号、不要序号、不要任何解释或开场白
- 只输出日记正文本身

如果照片里根本没有可读的手写内容，只输出：EMPTY`

export interface TranscribeResult {
  ok: boolean
  /** 转写出来的日记正文 */
  content: string
  /** 失败时的人话解释 */
  error: string
  ms: number
}

/** 把一张压缩好的图片交给模型，拿回手写正文 */
export async function transcribeDiary(
  config: AiConfig,
  imageDataUrl: string,
): Promise<TranscribeResult> {
  const part: ChatContentPart = { type: 'image_url', image_url: { url: imageDataUrl } }
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: '这是我手写的一页日记，请照上面的规矩转成文字。' },
          part,
        ],
      },
    ],
  })

  const content = pickReply(result.body)
    // 有的模型会自作主张包一层代码块，剥掉
    .replace(/^```[a-z]*\n/i, '')
    .replace(/\n```$/, '')
    .trim()

  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  if (content === 'EMPTY') {
    return {
      ok: false,
      content: '',
      error: '这张照片里没认出字。拍清楚一点、让纸占满画面，再试一次。',
      ms: result.ms,
    }
  }
  return { ok: true, content, error: '', ms: result.ms }
}
