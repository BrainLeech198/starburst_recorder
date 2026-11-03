import { describe, expect, it } from 'vitest'
import { b64urlDecode, b64urlEncode, ecJwk, encryptPayload, vapidHeaders } from './webpush.js'

/**
 * 官方样例来自 RFC 8291 §5 / 附录 A：明文、双方密钥、auth、salt 与**完整密文**都是给定的。
 * 逐字节比对是这组代码唯一的硬证据——自己加密再自己解密能过，不代表别的浏览器解得开。
 */
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

async function rfcKeyPair() {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    ecJwk(RFC.asPrivate, RFC.asPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const publicKey = await crypto.subtle.importKey(
    'raw',
    b64urlDecode(RFC.asPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
  return { privateKey, publicKey }
}

describe('aes128gcm 加密', () => {
  it('对 RFC 8291 官方样例逐字节一致', async () => {
    const body = await encryptPayload(
      new TextEncoder().encode(RFC.plaintext),
      { keys: { p256dh: RFC.uaPublic, auth: RFC.auth } },
      { salt: b64urlDecode(RFC.salt), asKeys: await rfcKeyPair() },
    )
    expect(b64urlEncode(body)).toBe(RFC.body)
  })

  it('头部是 86 字节：salt + rs(4096) + 公钥长度 + 公钥', async () => {
    const body = await encryptPayload(
      new TextEncoder().encode('hi'),
      { keys: { p256dh: RFC.uaPublic, auth: RFC.auth } },
      { salt: b64urlDecode(RFC.salt), asKeys: await rfcKeyPair() },
    )
    const header = body.slice(0, 86)
    expect(header.slice(0, 16)).toEqual(b64urlDecode(RFC.salt))
    expect([...header.slice(16, 20)]).toEqual([0x00, 0x00, 0x10, 0x00])
    expect(header[20]).toBe(65)
    expect(header.slice(21, 86)).toEqual(b64urlDecode(RFC.asPublic))
    // 明文 2 字节 + 0x02 分隔符 + 16 字节 GCM tag
    expect(body.length).toBe(86 + 2 + 1 + 16)
  })

  it('每次加密都用新的 salt 与临时密钥，密文不重复', async () => {
    const payload = new TextEncoder().encode('same text')
    const subscription = { keys: { p256dh: RFC.uaPublic, auth: RFC.auth } }
    const first = await encryptPayload(payload, subscription)
    const second = await encryptPayload(payload, subscription)
    expect(b64urlEncode(first)).not.toBe(b64urlEncode(second))
  })

  it('公钥不是 65 字节未压缩点时直接报错，而不是推一条注定解不开的消息', () => {
    expect(() => ecJwk(RFC.asPrivate, b64urlEncode(new Uint8Array(33)))).toThrow(/未压缩点/)
  })
})

describe('VAPID 认证头', () => {
  async function makeEnv() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    return {
      env: {
        VAPID_PRIVATE_KEY: jwk.d,
        VAPID_PUBLIC_KEY: b64urlEncode(publicKey),
        VAPID_SUBJECT: 'mailto:test@example.com',
      },
      publicKey: pair.publicKey,
    }
  }

  it('JWT 的 aud 取推送服务的源，sub 用配置的邮箱', async () => {
    const { env } = await makeEnv()
    const { Authorization } = await vapidHeaders(
      'https://fcm.googleapis.com/wp/abc123',
      env,
      1_700_000_000_000,
    )
    const jwt = Authorization.match(/^vapid t=(.+), k=(.+)$/)
    expect(jwt).not.toBeNull()
    expect(jwt[2]).toBe(env.VAPID_PUBLIC_KEY)

    const [header, payload] = jwt[1].split('.').slice(0, 2)
    const decodedHeader = JSON.parse(new TextDecoder().decode(b64urlDecode(header)))
    const decodedPayload = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)))
    expect(decodedHeader).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(decodedPayload.aud).toBe('https://fcm.googleapis.com')
    expect(decodedPayload.sub).toBe('mailto:test@example.com')
    expect(decodedPayload.exp).toBe(1_700_000_000 + 12 * 60 * 60)
  })

  it('签名能被公钥验证（推送服务就是这么验的）', async () => {
    const { env, publicKey } = await makeEnv()
    const { Authorization } = await vapidHeaders('https://updates.push.services.mozilla.com/x', env)
    const token = Authorization.match(/^vapid t=(.+), k=/)[1]
    const [header, payload, signature] = token.split('.')
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      b64urlDecode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    )
    expect(ok).toBe(true)
  })
})

describe('base64url', () => {
  it('编解码可逆，且不含 + / = 这三个在 URL 里要转义的字符', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0x00, 0x3e, 0x3f, 0xfe])
    const encoded = b64urlEncode(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(b64urlEncode(b64urlDecode(encoded))).toBe(encoded)
  })
})
