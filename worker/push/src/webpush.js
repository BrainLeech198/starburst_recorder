/**
 * Web Push 的服务端密码学部分：VAPID 签名 + RFC 8291 的 aes128gcm 加密。
 *
 * 为什么要自己写：Cloudflare Worker 里没有 web-push 这种 Node 库（那套依赖 Node 的
 * crypto 模块与 Buffer），而这条链只需要四个 WebCrypto 原语——HKDF、ECDH、ECDSA、AES-GCM。
 * 全部实现不到 150 行，比塞一个 polyfill 省事，也省掉了打包步骤。
 *
 * 两个规范各管一半：
 *   - RFC 8291：怎么把「推送服务只负责转发、看不到内容」这件事做出来（端到端加密）；
 *   - RFC 8188：加密后的字节怎么排布（86 字节头 + 密文）。
 * 单测里用 RFC 8291 附录 A 的官方样例逐字节对过，改这里的任何一步都会立刻炸测试。
 */

const TEXT = new TextEncoder()

/** 单条记录的明文上限（RFC 8188 的 rs）。我们的载荷只有几十字节，4096 足够 */
const RECORD_SIZE = 4096

/** base64url → 字节。Worker 里没有 Buffer，用 atob 手工转 */
export function b64urlDecode(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** 字节 → base64url（无填充）。JWT 和 VAPID 的 k 参数都用这个格式 */
export function b64urlEncode(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** RFC 5869 的 HKDF-SHA256。WebCrypto 的 HKDF 一次就能算完 Extract + Expand */
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/**
 * 把「32 字节私钥 + 65 字节未压缩公钥」拼成 JWK。
 *
 * WebCrypto 不接受裸的 P-256 私钥，只认 JWK 或 PKCS8；而 VAPID 生态里流传的私钥
 * 一律是 base64url 的裸标量，公钥是 0x04 开头的裸点——所以要在这里把 x / y 拆出来。
 */
export function ecJwk(privateKeyB64, publicKeyB64) {
  const pub = b64urlDecode(publicKeyB64)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID 公钥必须是 65 字节未压缩点（0x04 开头）')
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
  }
}

/** 把 VAPID 私钥导入成可签名的 CryptoKey（同一 isolate 内复用，省掉重复导入） */
let signingKeyCache = null

async function vapidSigningKey(env) {
  const fingerprint = `${env.VAPID_PRIVATE_KEY}|${env.VAPID_PUBLIC_KEY}`
  if (signingKeyCache?.fingerprint === fingerprint) return signingKeyCache.promise
  const promise = crypto.subtle.importKey(
    'jwk',
    ecJwk(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  signingKeyCache = { fingerprint, promise }
  return promise
}

/** VAPID JWT 只对「同一个推送服务源」有意义，按 origin 缓存到过期前 1 小时 */
const jwtCache = new Map()
const JWT_TTL_SECONDS = 12 * 60 * 60

async function vapidJwt(endpoint, env, nowMs) {
  const audience = new URL(endpoint).origin
  const cached = jwtCache.get(audience)
  const nowSeconds = Math.floor(nowMs / 1000)
  if (cached && cached.expiresAt - 3600 > nowSeconds) return cached.jwt

  const header = b64urlEncode(TEXT.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64urlEncode(
    TEXT.encode(
      JSON.stringify({
        aud: audience,
        // 推送服务允许的最大有效期是 24 小时；12 小时足够覆盖一次 cron 的复用窗口
        exp: nowSeconds + JWT_TTL_SECONDS,
        sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
      }),
    ),
  )
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await vapidSigningKey(env),
    TEXT.encode(signingInput),
  )
  // WebCrypto 的 ECDSA 输出就是 JWS 要的 r||s（64 字节），不用再转 DER
  const jwt = `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`
  jwtCache.set(audience, { jwt, expiresAt: nowSeconds + JWT_TTL_SECONDS })
  return jwt
}

/** 发推送时要带的认证头。`k` 是公钥，推送服务用它验证签名确实来自我们 */
export async function vapidHeaders(endpoint, env, nowMs = Date.now()) {
  const jwt = await vapidJwt(endpoint, env, nowMs)
  return {
    Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
  }
}

/**
 * RFC 8291 加密一条推送消息。
 *
 * 链路（每一步都不能省）：
 *   1. 临时 ECDH 密钥对 + 订阅方的 p256dh 算出共享密钥；
 *   2. 用 auth 当 salt、共享密钥当 ikm，导出 32 字节 IKM；
 *   3. 用随机 salt 和 IKM 导出 CEK 与 nonce；
 *   4. 明文尾部补 0x02（最后一条记录的分隔符），AES-128-GCM 加密；
 *   5. 前面拼上 86 字节头：salt(16) + rs(4) + idlen(1) + 临时公钥(65)。
 *
 * `options.salt` / `options.asKeys` 只为单测留的口子（对官方样例做逐字节比对），
 * 线上调用不要传。
 */
export async function encryptPayload(payload, subscription, options = {}) {
  const uaPublic = b64urlDecode(subscription.keys.p256dh)
  const authSecret = b64urlDecode(subscription.keys.auth)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const asKeys =
    options.asKeys ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey))

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  )

  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(TEXT.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic),
    32,
  )
  const cek = await hkdf(
    salt,
    ikm,
    concat(TEXT.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])),
    16,
  )
  const nonce = await hkdf(
    salt,
    ikm,
    concat(TEXT.encode('Content-Encoding: nonce'), new Uint8Array([0])),
    12,
  )

  const record = concat(payload, new Uint8Array([0x02]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record),
  )

  const header = concat(
    salt,
    new Uint8Array([
      (RECORD_SIZE >>> 24) & 0xff,
      (RECORD_SIZE >>> 16) & 0xff,
      (RECORD_SIZE >>> 8) & 0xff,
      RECORD_SIZE & 0xff,
      asPublic.length,
    ]),
    asPublic,
  )
  return concat(header, ciphertext)
}
