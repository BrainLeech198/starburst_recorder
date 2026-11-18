import { describe, expect, it, vi } from 'vitest'
import type { Translate } from '@/shared/i18n/context'
import { getShareAdapter } from './shareAdapters'
import { SHARE_APP, SHARE_VERSION } from './shareCode'
import type { ShareDoc } from './shareCode'

const saved = vi.hoisted(() => ({ models: [] as Record<string, unknown>[] }))

vi.mock('@/features/ai/aiConfig', () => ({
  loadModels: () => saved.models,
  newModelId: () => 'local-new-id',
  saveModels: (models: Record<string, unknown>[]) => {
    saved.models = models
  },
}))

vi.mock('@/features/health/foodShare', () => ({ importSharedDoc: vi.fn() }))
vi.mock('./recordShare', () => ({
  importSharedDiary: vi.fn(),
  importSharedFinance: vi.fn(),
  importSharedIntake: vi.fn(),
  importSharedStamp: vi.fn(),
}))

const t = ((key: string, params?: { name?: string }) => `${key}:${params?.name ?? ''}`) as Translate

function modelDoc(apiKey = 'sk-share-key', apiKeyEncrypted = false): ShareDoc {
  return {
    app: SHARE_APP,
    v: SHARE_VERSION,
    kind: 'aiModel',
    title: 'gpt-4o-mini',
    createdAt: 1,
    data: {
      providerId: 'openai',
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey,
      apiKeyEncrypted,
      vision: 'yes',
    },
  }
}

describe('AI 模型分享适配器', () => {
  it('导入为新模型，不带本机测试状态或分享协议字段', async () => {
    saved.models = []
    const doc = modelDoc()
    const message = await getShareAdapter(doc).import(doc, t)

    expect(message).toBe('share.aiModelImported:gpt-4o-mini')
    expect(saved.models).toEqual([
      {
        id: 'local-new-id',
        providerId: 'openai',
        providerName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'sk-share-key',
        vision: 'yes',
      },
    ])
  })

  it('拒绝尚未解锁的密钥，避免把密文存成 API Key', async () => {
    saved.models = []
    const doc = modelDoc('enc:v1:salt:iv:cipher', true)
    await expect(getShareAdapter(doc).import(doc, t)).rejects.toThrow()
    expect(saved.models).toEqual([])
  })
})
