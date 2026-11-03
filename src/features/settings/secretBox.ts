/**
 * 用口令加密备份文件里的 AI 密钥。
 *
 * 只加密一样东西：`sb_ai_models` 里每个模型的 `apiKey`。别的（日记、体重、收支、
 * 外观偏好）一律明文——它们不可再生，而密钥随时能从厂商后台再复制一份。
 * 为了一个可再生的字段给整份备份上口令，一旦忘记口令赔进去的是不可再生的数据，
 * 风险收益是反的。
 *
 * 加解密用浏览器原生的 WebCrypto，不引第三方库：
 *   - 口令 → PBKDF2-SHA256（15 万次迭代，随机 16 字节盐）→ 256 位密钥
 *   - 明文 → AES-GCM（随机 12 字节 IV，带认证标签，口令错会直接解密失败而不是给乱码）
 *
 * 密文格式：`enc:v1:<salt>:<iv>:<ciphertext>`，三段都是 base64url。
 * 带版本号是为了以后换算法时能识别老数据。
 *
 * **加密只保护「文件在路上的安全」**。导入后明文照样回到 localStorage——
 * 本地存储本来就没有加密，这条不在本次范围内。
 */
import type { PrefSnapshot } from './userPrefs'

/** 密文前缀。导入时靠它认出「这条要口令」，不靠猜 */
const PREFIX = 'enc:v1:'
/** PBKDF2 迭代次数：手机上约几十毫秒，足以让离线爆破变慢 */
const ITERATIONS = 150_000
/** 备份里唯一含密钥的偏好键 */
const MODELS_KEY = 'sb_ai_models'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  // 显式建在 ArrayBuffer 上：WebCrypto 的 BufferSource 不接受 SharedArrayBuffer 支撑的视图
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as Uint8Array<ArrayBuffer>,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 一段明文 → `enc:v1:...` */
export async function encryptText(plain: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  return `${PREFIX}${b64url(salt)}:${b64url(iv)}:${b64url(new Uint8Array(cipher))}`
}

/**
 * `enc:v1:...` → 明文。口令错 / 数据被改过都会抛错——
 * AES-GCM 的认证标签会把这两种情况都挡住，不会安静地吐出乱码。
 */
export async function decryptText(payload: string, passphrase: string): Promise<string> {
  if (!payload.startsWith(PREFIX)) throw new Error('不是加密数据')
  const [saltPart, ivPart, bodyPart] = payload.slice(PREFIX.length).split(':')
  if (!saltPart || !ivPart || !bodyPart) throw new Error('密文格式不对')
  const key = await deriveKey(passphrase, fromB64url(saltPart))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(ivPart) },
    key,
    fromB64url(bodyPart),
  )
  return new TextDecoder().decode(plain)
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** 解析 `sb_ai_models`，把每个非空 apiKey 过一遍 fn；不是合法数组时原样返回 null */
async function mapModelKeys(
  raw: string,
  fn: (key: string) => Promise<string>,
): Promise<string | null> {
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  const next: unknown[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      next.push(item)
      continue
    }
    const record = item as Record<string, unknown>
    const key = record.apiKey
    if (typeof key === 'string' && key.trim() !== '') {
      next.push({ ...record, apiKey: await fn(key) })
    } else {
      next.push(item)
    }
  }
  return JSON.stringify(next)
}

/** 这份快照里有没有加密过的密钥：导入时据此决定要不要弹口令框 */
export function hasEncryptedSecrets(prefs: PrefSnapshot | undefined): boolean {
  const raw = prefs?.[MODELS_KEY]
  if (!raw) return false
  try {
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return false
    return list.some(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        isEncrypted((item as Record<string, unknown>).apiKey),
    )
  } catch {
    return false
  }
}

/** 导出前：把 apiKey 换成密文。其它键原样不动 */
export async function encryptPrefSecrets(
  prefs: PrefSnapshot,
  passphrase: string,
): Promise<PrefSnapshot> {
  const raw = prefs[MODELS_KEY]
  if (!raw) return prefs
  // 已经是密文的跳过：重复导出同一份快照不该套两层
  const next = await mapModelKeys(raw, (key) =>
    isEncrypted(key) ? Promise.resolve(key) : encryptText(key, passphrase),
  )
  return next === null ? prefs : { ...prefs, [MODELS_KEY]: next }
}

/**
 * 导入时：把密文换回明文。
 *
 * 口令错就**只丢这几个密钥**（apiKey 置空），其余数据照常导入——
 * 和备份模块的规矩一致：坏数据只丢那一条，不许整份拒绝。
 * 返回 `failed` 是解不开的条数，报告里要说清楚。
 */
export async function decryptPrefSecrets(
  prefs: PrefSnapshot,
  passphrase: string,
): Promise<{ prefs: PrefSnapshot; failed: number }> {
  const raw = prefs[MODELS_KEY]
  if (!raw) return { prefs, failed: 0 }
  let failed = 0
  const next = await mapModelKeys(raw, async (key) => {
    if (!isEncrypted(key)) return key
    try {
      return await decryptText(key, passphrase)
    } catch {
      failed += 1
      return ''
    }
  })
  return { prefs: next === null ? prefs : { ...prefs, [MODELS_KEY]: next }, failed }
}
