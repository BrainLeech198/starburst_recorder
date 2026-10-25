/**
 * 手写日记 → 文字。
 *
 * 两件事分开写在两个函数里：
 *   1. compressImage：手机拍的照片动辄好几 MB，先缩到长边 1600、转成 JPEG，再发给模型
 *   2. transcribeDiary：把压缩后的图交给模型，要求它只转写、不润色
 *
 * 原图不存：日记本身是纯文本，这张图只是一次性的输入。
 * 照片抬头通常自带日期和天气，一并让模型读出来，导入时就能直接复用。
 */
import type { ChatContentPart } from '@/platform/desktop'
import { toDateKey } from '@/core/utils/dateKey'
import { normalizeWeather } from '@/features/diary/weather'
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

const SYSTEM_PROMPT = `你负责把一张手写日记的照片转成结构化文字。

任务：
1. 逐字转写正文，保留原来的自然段。
2. 从页面顶部读取日期和天气；照片上没有就留空。

规矩：
- 只写照片上真实存在的字，不要润色、不要改写、不要补写，也不要合并或拆分句子
- 日期、星期、天气、页码这些抬头信息不要写进正文
- 正文保留自然段，段与段之间用 \\n\\n 分隔；每段直接开始，段首不要加任何符号
- 看不清的字用「□」代替，不要猜；一整句都看不清就写「（这一句看不清）」
- date 写成 YYYY-MM-DD；照片上只有月日时，年份按今年算
- weather 只能从「晴、多云、阴、雨、雪、风、雷」里选一个最接近的词，没有就留空
- 不要标题、不要 Markdown、不要序号、不要任何解释或开场白
- 只输出一个 JSON 对象，不要用代码块包起来

格式：
{"date":"2026-10-15","weather":"晴","content":"第一段\\n\\n第二段"}

如果照片里根本没有可读的手写内容，只输出：EMPTY`

/** 从照片里读出来的结构化结果 */
export interface Transcript {
  /** 照片抬头的日期；没认出来是空串 */
  dateKey: string
  /** 收敛到天气链上的词；没认出来是空串 */
  weather: string
  /** 转写出来的日记正文 */
  content: string
}

export interface TranscribeResult {
  ok: boolean
  /** 识别成功时的结构化结果 */
  transcript: Transcript | null
  /** 失败时的人话解释 */
  error: string
  ms: number
}

/** 模型偶尔还是会把 JSON 包进代码块，先剥掉 */
function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

/**
 * 日期归一化：兼容「2026年10月15日」「2026/10/15」「10月15日」，
 * 并且校验是不是真实存在的一天（2 月 30 日这种直接丢掉）。
 */
export function parseDateKey(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.trim()
  if (text === '') return ''
  const full = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/)
  const short = full ?? text.match(/(\d{1,2})\s*月\s*(\d{1,2})/)
  if (!short) return ''
  const year = full ? Number(short[1]) : new Date().getFullYear()
  const month = Number(full ? short[2] : short[1])
  const day = Number(full ? short[3] : short[2])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return ''
  }
  return toDateKey(date)
}

/**
 * 把模型回复解析成结构化结果。
 * 万一模型没按 JSON 回，就把整段当正文——宁可少日期和天气，也不能把日记弄丢。
 */
export function parseTranscript(reply: string): Transcript | null {
  const text = stripFence(reply)
  if (text === '' || /^EMPTY$/i.test(text)) return null

  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      const data = JSON.parse(json) as { date?: unknown; weather?: unknown; content?: unknown }
      const content = typeof data.content === 'string' ? data.content.trim() : ''
      if (content !== '') {
        return {
          dateKey: parseDateKey(data.date),
          weather: normalizeWeather(typeof data.weather === 'string' ? data.weather : ''),
          content,
        }
      }
    } catch {
      // 不是合法 JSON，走下面的整段兜底
    }
  }

  return { dateKey: '', weather: '', content: text }
}

/** 预设库给的辨认参考：只是提示，照片里没有就不能硬写 */
export interface TranscribeHints {
  people: string[]
  places: string[]
}

/** 把一张压缩好的图片交给模型，拿回正文、日期与天气 */
export async function transcribeDiary(
  config: AiConfig,
  imageDataUrl: string,
  hints?: TranscribeHints,
): Promise<TranscribeResult> {
  const part: ChatContentPart = { type: 'image_url', image_url: { url: imageDataUrl } }
  const people = hints?.people.filter((name) => name.trim() !== '') ?? []
  const places = hints?.places.filter((name) => name.trim() !== '') ?? []
  const system =
    people.length === 0 && places.length === 0
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}

补充参考：作者预设库里常出现的人名和地名如下，转写时可以优先往这些名字上辨认，
但照片里没有出现的名字绝不能补写进来。
${people.length > 0 ? `常用人物：${people.join('、')}` : ''}
${places.length > 0 ? `常用地名：${places.join('、')}` : ''}`.trim()

  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: '这是我手写的一页日记，请照上面的规矩转成文字。' },
          part,
        ],
      },
    ],
  })

  if (!result.ok) {
    return {
      ok: false,
      transcript: null,
      error: explainFailure(result, config.baseUrl),
      ms: result.ms,
    }
  }

  const transcript = parseTranscript(pickReply(result.body))
  if (!transcript) {
    return {
      ok: false,
      transcript: null,
      error: '这张照片里没认出字。拍清楚一点、让纸占满画面，再试一次。',
      ms: result.ms,
    }
  }
  return { ok: true, transcript, error: '', ms: result.ms }
}
