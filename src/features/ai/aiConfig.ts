/**
 * AI 网关的配置。
 *
 * 现在存的是「模型列表 + 启用其中一个」：每条都是完整配置（厂商、地址、模型名、key），
 * 所以可以在 DeepSeek、MiMo、本机模型之间整条切换，key 各存各的。
 * 配置跟主题色、悬浮球一样存在 localStorage，不动数据库版本。
 *
 * 老版本只存了单独一套 `sb_ai_config`，第一次读列表时会自动搬成第一条并启用，
 * 用户不用重新填一遍。
 */

import type { MessageKey } from '@/shared/i18n/messages/zh'

export interface AiProvider {
  id: string
  labelKey: MessageKey
  /** 点一下它，就把下面这两个填进去，省得你去官网翻文档 */
  baseUrl: string
  model: string
  /** key 去哪儿拿（写给第一次配的人看） */
  keyUrl?: string
  /** 去哪看这家有哪些模型名：模型列表拉不到时，页面会把这个网址亮出来 */
  modelListUrl?: string
  /** 这家需要特别提醒的一句话 */
  noteKey?: MessageKey
  /** 本机模型不校验 key，可以不填 */
  keyOptional?: boolean
}

/** 内置的厂商预设，按「大概率用得上」排序 */
export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'mimo',
    labelKey: 'ai.preset.mimo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    keyUrl: 'https://platform.xiaomimimo.com',
    modelListUrl: 'https://platform.xiaomimimo.com',
    noteKey: 'ai.note.mimo',
  },
  {
    id: 'deepseek',
    labelKey: 'ai.preset.deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com',
    modelListUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
  {
    id: 'siliconflow',
    labelKey: 'ai.preset.siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-8B',
    keyUrl: 'https://cloud.siliconflow.cn',
    modelListUrl: 'https://cloud.siliconflow.cn/models',
    noteKey: 'ai.note.siliconflow',
  },
  {
    id: 'kimi',
    labelKey: 'ai.preset.kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn',
    modelListUrl: 'https://platform.moonshot.cn/docs/pricing/chat',
  },
  {
    id: 'qwen',
    labelKey: 'ai.preset.qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com',
    modelListUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
  },
  {
    id: 'openai',
    labelKey: 'ai.preset.openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    modelListUrl: 'https://platform.openai.com/docs/models',
    noteKey: 'ai.note.openai',
  },
  {
    id: 'ollama',
    labelKey: 'ai.preset.ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
    modelListUrl: 'https://ollama.com/library',
    noteKey: 'ai.note.ollama',
    keyOptional: true,
  },
  {
    id: 'custom',
    labelKey: 'ai.preset.custom',
    baseUrl: '',
    model: '',
    noteKey: 'ai.note.custom',
  },
]

/** 预设厂商的显示名 key；用户自己敲的名字没有 key，按原样显示 */
export function presetNameKey(providerId: string): MessageKey | null {
  return AI_PROVIDERS.find((item) => item.id === providerId)?.labelKey ?? null
}

/** 上次测试得出的看图能力；unknown 表示还没测或没测出来 */
export type VisionState = 'yes' | 'no' | 'unknown'

/** 一条模型配置。AI 请求需要的字段都在这里，页面和请求代码直接拿它用 */
export interface AiConfig {
  providerId: string
  /** 用户自己敲的厂商名；预设厂商显示时按 providerId 取文案，不读这里 */
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
  vision: VisionState
}

/** 一次联通测试的结果：存在条目上，下次打开页面还在 */
export interface AiTestResult {
  /** 文字通不通（看图能力单独看 vision） */
  ok: boolean
  /** 一来一回的耗时，毫秒 */
  ms: number
  /** 测的时间戳 */
  at: number
  /** 这次测出来的看图能力 */
  vision: VisionState
  /** 没通时的原因，用一句话说清楚；通了是空串 */
  error: string
}

/** 模型列表里的一条 = 完整配置 + 它自己的测试结果 */
export interface AiModel extends AiConfig {
  id: string
  lastTest?: AiTestResult
}

const MODELS_KEY = 'sb_ai_models'
const ACTIVE_KEY = 'sb_ai_active'
/** 老版本的单套配置，只用来做一次迁移 */
const LEGACY_KEY = 'sb_ai_config'

const EMPTY_CONFIG: AiConfig = {
  providerId: '',
  providerName: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  vision: 'unknown',
}

function visionOf(value: unknown): VisionState {
  return value === 'yes' || value === 'no' ? value : 'unknown'
}

/** 生成一个本地 id：只用来在列表里区分条目，不参与任何请求 */
export function newModelId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 把存下来的一条修成完整形状；缺关键字段（地址 / 模型名）的直接丢掉 */
function normalize(value: unknown): AiModel | null {
  if (value === null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  if (baseUrl === '' || model === '') return null
  const test = record.lastTest as Record<string, unknown> | undefined
  return {
    id: typeof record.id === 'string' && record.id !== '' ? record.id : newModelId(),
    providerId: typeof record.providerId === 'string' ? record.providerId : '',
    providerName:
      typeof record.providerName === 'string' ? record.providerName.trim() : '',
    baseUrl,
    model,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    vision: visionOf(record.vision),
    lastTest:
      test && typeof test === 'object' && typeof test.ok === 'boolean'
        ? {
            ok: test.ok,
            ms: typeof test.ms === 'number' ? test.ms : 0,
            at: typeof test.at === 'number' ? test.at : 0,
            vision: visionOf(test.vision),
            error: typeof test.error === 'string' ? test.error : '',
          }
        : undefined,
  }
}

/** 老版本那套单配置：地址和模型都填了才算有效，否则没有可迁移的内容 */
function loadLegacy(): AiModel | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    const baseUrl = String(parsed.baseUrl ?? '').trim()
    const model = String(parsed.model ?? '').trim()
    if (baseUrl === '' || model === '') return null
    const preset = AI_PROVIDERS.find((item) => item.id === parsed.providerId)
    return {
      id: newModelId(),
      providerId: preset?.id ?? parsed.providerId ?? '',
      providerName: String(parsed.providerName ?? '').trim(),
      baseUrl,
      model,
      apiKey: String(parsed.apiKey ?? ''),
      vision: visionOf(parsed.vision),
    }
  } catch {
    return null
  }
}

/**
 * 读模型列表。
 * 列表为空时顺手把老配置搬成第一条（只搬一次，搬完删掉老键，避免重复出现）。
 */
export function loadModels(): AiModel[] {
  try {
    const raw = localStorage.getItem(MODELS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    const models = Array.isArray(list)
      ? list.map(normalize).filter((item): item is AiModel => item !== null)
      : []
    if (models.length > 0) return models

    const legacy = loadLegacy()
    if (!legacy) return []
    localStorage.setItem(MODELS_KEY, JSON.stringify([legacy]))
    localStorage.setItem(ACTIVE_KEY, legacy.id)
    localStorage.removeItem(LEGACY_KEY)
    return [legacy]
  } catch {
    return []
  }
}

export function saveModels(models: AiModel[]) {
  localStorage.setItem(MODELS_KEY, JSON.stringify(models))
}

/**
 * 当前启用的是哪一条。
 *
 * 三条规则：
 *   - 没存过：用第一条（老用户升级后不用手动点）
 *   - 存了空串：就是「没有启用任何模型」——用户删掉了启用中的那条，先留空
 *   - 存了但那条不在了：退回第一条，免得配置看起来像丢了
 */
export function loadActiveId(models: AiModel[] = loadModels()): string {
  const stored = localStorage.getItem(ACTIVE_KEY)
  if (stored === null) return models[0]?.id ?? ''
  if (stored === '') return ''
  return models.some((item) => item.id === stored) ? stored : (models[0]?.id ?? '')
}

export function saveActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id)
}

/** 正在启用的那条模型；一条都没有时返回 undefined */
export function activeModel(models: AiModel[] = loadModels()): AiModel | undefined {
  const id = loadActiveId(models)
  return models.find((item) => item.id === id)
}

/**
 * 给 aiClient / 页面拿「现在该用哪套配置」。
 * 形状跟以前的单套配置完全一样，所以请求代码不用改。
 */
export function loadAiConfig(): AiConfig {
  return activeModel() ?? EMPTY_CONFIG
}

/** 地址和模型名填了就够发起请求；本机模型的 key 可以空着 */
export function isConfigured(config: AiConfig) {
  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const hasKey = config.apiKey.trim() !== '' || provider?.keyOptional === true
  return config.baseUrl.trim() !== '' && config.model.trim() !== '' && hasKey
}

/** 还差哪几样：设置页顶上那条状态要用它说人话 */
export function missingFields(config: AiConfig): MessageKey[] {
  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const missing: MessageKey[] = []
  if (config.baseUrl.trim() === '') missing.push('ai.baseUrl')
  if (config.model.trim() === '') missing.push('ai.modelName')
  if (config.apiKey.trim() === '' && provider?.keyOptional !== true) missing.push('ai.key')
  return missing
}

/** 能不能点「测试联通」：只要地址和模型名够发请求就行 */
export function canTest(config: AiConfig) {
  return config.baseUrl.trim() !== '' && config.model.trim() !== ''
}
