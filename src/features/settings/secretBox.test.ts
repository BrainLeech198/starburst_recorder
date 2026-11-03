import { describe, expect, it } from 'vitest'
import {
  decryptPrefSecrets,
  decryptText,
  encryptPrefSecrets,
  encryptText,
  hasEncryptedSecrets,
  isEncrypted,
} from './secretBox'
import type { PrefSnapshot } from './userPrefs'

const MODELS = JSON.stringify([
  {
    id: 'm_1',
    providerName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-very-secret',
    vision: 'yes',
    lastTest: { ok: true, ms: 120, at: 1, vision: 'yes', error: '' },
  },
  {
    id: 'm_2',
    providerName: '本地',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen',
    apiKey: '',
    vision: 'unknown',
  },
])

function snapshot(): PrefSnapshot {
  return { sb_ai_models: MODELS, sb_locale: 'zh', 'starburst.theme': 'deep' }
}

describe('encryptText / decryptText', () => {
  it('加密再解密能拿回原文', async () => {
    const cipher = await encryptText('sk-very-secret', '口令 123')
    expect(await decryptText(cipher, '口令 123')).toBe('sk-very-secret')
  })

  it('密文带版本前缀、三段，且不含明文', async () => {
    const cipher = await encryptText('sk-very-secret', 'pass')
    expect(cipher.startsWith('enc:v1:')).toBe(true)
    expect(cipher.slice('enc:v1:'.length).split(':')).toHaveLength(3)
    expect(cipher).not.toContain('sk-very-secret')
  })

  it('口令错直接抛错，不会吐出乱码', async () => {
    const cipher = await encryptText('sk-very-secret', 'right')
    await expect(decryptText(cipher, 'wrong')).rejects.toBeTruthy()
  })

  it('同一段明文每次加密结果都不同（盐和 IV 都是随机的）', async () => {
    const a = await encryptText('same', 'pass')
    const b = await encryptText('same', 'pass')
    expect(a).not.toBe(b)
  })
})

describe('加密范围只到 apiKey', () => {
  it('只换 apiKey，其余字段与其它偏好原样保留', async () => {
    const encrypted = await encryptPrefSecrets(snapshot(), 'pass')
    const list = JSON.parse(encrypted.sb_ai_models) as Record<string, unknown>[]

    expect(isEncrypted(list[0].apiKey)).toBe(true)
    // 空密钥不动：本来就没有秘密可藏
    expect(list[1].apiKey).toBe('')
    expect(list[0].providerName).toBe('OpenAI')
    expect(list[0].baseUrl).toBe('https://api.openai.com/v1')
    expect(list[0].lastTest).toEqual({ ok: true, ms: 120, at: 1, vision: 'yes', error: '' })
    expect(encrypted.sb_locale).toBe('zh')
    expect(encrypted['starburst.theme']).toBe('deep')
  })

  it('识别得出「这份快照里有加密密钥」', async () => {
    expect(hasEncryptedSecrets(snapshot())).toBe(false)
    expect(hasEncryptedSecrets(await encryptPrefSecrets(snapshot(), 'pass'))).toBe(true)
    expect(hasEncryptedSecrets(undefined)).toBe(false)
    expect(hasEncryptedSecrets({ sb_ai_models: '不是 JSON' })).toBe(false)
  })

  it('没有 sb_ai_models 时原样返回', async () => {
    const plain = { sb_locale: 'en' }
    expect(await encryptPrefSecrets(plain, 'pass')).toBe(plain)
    const result = await decryptPrefSecrets(plain, 'pass')
    expect(result.prefs).toBe(plain)
    expect(result.failed).toBe(0)
  })
})

describe('解密回填', () => {
  it('口令对：密钥复原', async () => {
    const encrypted = await encryptPrefSecrets(snapshot(), 'pass')
    const { prefs, failed } = await decryptPrefSecrets(encrypted, 'pass')
    expect(failed).toBe(0)
    const list = JSON.parse(prefs.sb_ai_models) as Record<string, unknown>[]
    expect(list[0].apiKey).toBe('sk-very-secret')
  })

  it('口令错：只丢密钥、不整份失败，其它数据照常导入', async () => {
    const encrypted = await encryptPrefSecrets(snapshot(), 'right')
    const { prefs, failed } = await decryptPrefSecrets(encrypted, 'wrong')
    expect(failed).toBe(1)
    const list = JSON.parse(prefs.sb_ai_models) as Record<string, unknown>[]
    // 密钥清空，但模型本身还在——用户只要重新填一次 key
    expect(list[0].apiKey).toBe('')
    expect(list[0].model).toBe('gpt-4o-mini')
    expect(prefs.sb_locale).toBe('zh')
  })
})
