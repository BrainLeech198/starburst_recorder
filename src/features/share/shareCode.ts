/**
 * 分享码协议：把一条配置压成一段可放进二维码 / 剪贴板的文本。
 *
 * 用 `SB1.` 前缀区分「gzip 后的分享码」和 `SB0.`「未压缩的分享码」，
 * 没有 CompressionStream 的老 WebView 会自动退回未压缩，接收端两种都认。
 * 纯文本 JSON 也接受，方便调试和手工粘贴。
 *
 * 二维码只装得下约 1KB，所以分享弹窗会另外生成一份去掉照片的码；
 * 带照片的完整内容走复制分享码 / 保存分享文件。
 */

export const SHARE_APP = 'starburst-recorder'
export const SHARE_VERSION = 1
const PREFIX_GZIP = 'SB1.'
const PREFIX_PLAIN = 'SB0.'
/** 再大就别解析了：防止有人粘进来一段几 MB 的垃圾文本 */
const MAX_SHARE_TEXT = 2_000_000
/** 手机对着屏幕扫，超过这个长度就开始难扫；宁可提示改用文件 */
export const SHARE_QR_MAX_CHARS = 1200

export type ShareKind = 'food' | 'meal'

export interface ShareFoodConfig {
  name: string
  code: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  servingName: string | null
  servingGrams: number | null
  photo: string | null
}

export interface ShareMealItemConfig {
  food: ShareFoodConfig
  grams: number
}

export interface ShareMealConfig {
  name: string
  items: ShareMealItemConfig[]
}

interface ShareDocBase {
  app: typeof SHARE_APP
  v: typeof SHARE_VERSION
  createdAt: number
  title: string
}

export interface ShareFoodDoc extends ShareDocBase {
  kind: 'food'
  data: ShareFoodConfig
}

export interface ShareMealDoc extends ShareDocBase {
  kind: 'meal'
  data: ShareMealConfig
}

export type ShareDoc = ShareFoodDoc | ShareMealDoc

/** 解析失败时只暴露一句人话，调用方不用关心是压缩坏了还是字段不对 */
export class ShareParseError extends Error {
  constructor() {
    super('invalid share code')
    this.name = 'ShareParseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : null
}

function optionalNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : isFiniteNumber(value) ? value : null
}

function parseFoodConfig(value: unknown): ShareFoodConfig | null {
  if (!isRecord(value)) return null
  const name = text(value.name, 80)
  if (!name) return null
  const nutrients: Array<'kcal' | 'protein' | 'carbs' | 'fat'> = ['kcal', 'protein', 'carbs', 'fat']
  for (const key of nutrients) {
    const amount = value[key]
    if (!isFiniteNumber(amount) || amount < 0 || amount > 100_000) return null
  }
  const photo = optionalText(value.photo, 3_000_000)
  return {
    name,
    code: optionalText(value.code, 16) ?? '',
    kcal: value.kcal as number,
    protein: value.protein as number,
    carbs: value.carbs as number,
    fat: value.fat as number,
    servingName: optionalText(value.servingName, 40),
    servingGrams: optionalNumber(value.servingGrams),
    photo: photo && photo.startsWith('data:image/') ? photo : null,
  }
}

function parseMealConfig(value: unknown): ShareMealConfig | null {
  if (!isRecord(value)) return null
  const name = text(value.name, 80)
  if (!name || !Array.isArray(value.items) || value.items.length === 0) return null
  if (value.items.length > 50) return null
  const items: ShareMealItemConfig[] = []
  for (const raw of value.items) {
    if (!isRecord(raw)) return null
    const food = parseFoodConfig(raw.food)
    if (!food) return null
    const grams = raw.grams
    if (!isFiniteNumber(grams) || grams <= 0 || grams > 100_000) return null
    items.push({ food, grams })
  }
  return { name, items }
}

function parseDoc(value: unknown): ShareDoc {
  if (!isRecord(value)) throw new ShareParseError()
  if (value.app !== SHARE_APP || value.v !== SHARE_VERSION) throw new ShareParseError()
  const title = optionalText(value.title, 80)
  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : Date.now()
  if (value.kind === 'food') {
    const data = parseFoodConfig(value.data)
    if (!data) throw new ShareParseError()
    return { app: SHARE_APP, v: SHARE_VERSION, kind: 'food', title: title ?? data.name, createdAt, data }
  }
  if (value.kind === 'meal') {
    const data = parseMealConfig(value.data)
    if (!data) throw new ShareParseError()
    return { app: SHARE_APP, v: SHARE_VERSION, kind: 'meal', title: title ?? data.name, createdAt, data }
  }
  throw new ShareParseError()
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const input = new Uint8Array(bytes.length)
    input.set(bytes)
    const stream = new CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    await writer.write(input)
    await writer.close()
    const buffer = await new Response(stream.readable).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

async function ungzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const input = new Uint8Array(bytes.length)
    input.set(bytes)
    const stream = new DecompressionStream('gzip')
    const writer = stream.writable.getWriter()
    await writer.write(input)
    await writer.close()
    const buffer = await new Response(stream.readable).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

/** 完整分享码：照片等原始内容原样带上，适合复制 / 存文件 */
export async function encodeShare(doc: ShareDoc): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(doc))
  const compressed = await gzip(bytes)
  if (compressed && compressed.length < bytes.length) {
    return PREFIX_GZIP + bytesToBase64Url(compressed)
  }
  return PREFIX_PLAIN + bytesToBase64Url(bytes)
}

/** 去掉照片的副本：二维码只装得下这部分 */
export function stripSharePhotos(doc: ShareDoc): ShareDoc {
  if (doc.kind === 'food') {
    return { ...doc, data: { ...doc.data, photo: null } }
  }
  return {
    ...doc,
    data: {
      ...doc.data,
      items: doc.data.items.map((item) => ({ ...item, food: { ...item.food, photo: null } })),
    },
  }
}

export function hasSharePhotos(doc: ShareDoc): boolean {
  if (doc.kind === 'food') return !!doc.data.photo
  return doc.data.items.some((item) => !!item.food.photo)
}

export function fitsShareQr(text: string): boolean {
  return text.length <= SHARE_QR_MAX_CHARS
}

export async function decodeShare(text: string): Promise<ShareDoc> {
  const raw = text.trim()
  if (!raw || raw.length > MAX_SHARE_TEXT) throw new ShareParseError()

  if (raw.startsWith('{')) {
    try {
      return parseDoc(JSON.parse(raw))
    } catch (error) {
      if (error instanceof ShareParseError) throw error
      throw new ShareParseError()
    }
  }

  const compact = raw.replace(/\s+/g, '')
  let payload: string
  let bytes: Uint8Array
  if (compact.startsWith(PREFIX_GZIP)) {
    payload = compact.slice(PREFIX_GZIP.length)
    const decoded = base64UrlToBytes(payload)
    const plain = await ungzip(decoded)
    if (!plain) throw new ShareParseError()
    bytes = plain
  } else if (compact.startsWith(PREFIX_PLAIN)) {
    payload = compact.slice(PREFIX_PLAIN.length)
    bytes = base64UrlToBytes(payload)
  } else {
    throw new ShareParseError()
  }

  try {
    return parseDoc(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error) {
    if (error instanceof ShareParseError) throw error
    throw new ShareParseError()
  }
}
