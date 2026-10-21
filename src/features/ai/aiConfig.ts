/**
 * AI 网关的配置。
 *
 * 只存三样东西：服务地址、模型名、API Key——刻意按「OpenAI 兼容」的通用形状写，
 * 所以换服务商不用改代码，只是换这几个值。
 * 配置跟主题色、悬浮球一样存在 localStorage，不动数据库版本。
 */

export interface AiProvider {
  id: string
  label: string
  /** 点一下它，就把下面这两个填进去，省得你去官网翻文档 */
  baseUrl: string
  model: string
  /** key 去哪儿拿（写给第一次配的人看） */
  keyUrl?: string
  /** 这家需要特别提醒的一句话 */
  note?: string
  /** 本机模型不校验 key，可以不填 */
  keyOptional?: boolean
}

/** 内置的厂商预设，按「大概率用得上」排序 */
export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'mimo',
    label: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    keyUrl: 'https://platform.xiaomimimo.com',
    note: '如果你领过套餐，控制台会给一个「专属 Base URL」，跟这里填的不一样，以控制台为准。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-8B',
    keyUrl: 'https://cloud.siliconflow.cn',
    note: '模型名带斜杠（例如 Qwen/Qwen3-8B），照控制台原样复制。',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn',
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: '国内直连这个地址多半要挂代理，连不上先检查代理。',
  },
  {
    id: 'ollama',
    label: '本机模型',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
    note: '走本机 Ollama，内容完全不出这台机器。前提是先装好 Ollama 并让它运行，再把模型拉下来（ollama pull qwen3:8b）。',
    keyOptional: true,
  },
  {
    id: 'custom',
    label: '自定义',
    baseUrl: '',
    model: '',
    note: '地址填到 /v1 这一层为止，别把 /chat/completions 也写进去。',
  },
]

/** 上次测试得出的看图能力；unknown 表示还没测或没测出来 */
export type VisionState = 'yes' | 'no' | 'unknown'

export interface AiConfig {
  providerId: string
  /** 厂商在表单里显示的名字：预设的标签，或者用户自己敲的 */
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
  vision: VisionState
}

const STORAGE_KEY = 'sb_ai_config'

const EMPTY: AiConfig = {
  providerId: '',
  providerName: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  vision: 'unknown',
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    // 老版本只存了 providerId，把显示名补回来，免得表单看起来是空的
    const preset = AI_PROVIDERS.find((item) => item.id === parsed.providerId)
    return {
      providerId: parsed.providerId ?? '',
      providerName: parsed.providerName ?? preset?.label ?? '',
      baseUrl: parsed.baseUrl ?? '',
      model: parsed.model ?? '',
      apiKey: parsed.apiKey ?? '',
      vision:
        parsed.vision === 'yes' || parsed.vision === 'no' ? parsed.vision : 'unknown',
    }
  } catch {
    return EMPTY
  }
}

export function saveAiConfig(config: AiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/** 用户自己填过的服务商：下次不用再敲一遍地址和模型 */
export interface SavedProvider {
  name: string
  baseUrl: string
  model: string
}

const SAVED_KEY = 'sb_ai_providers'

export function loadSavedProviders(): SavedProvider[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return []
    return list.filter(
      (item): item is SavedProvider =>
        typeof item?.name === 'string' &&
        typeof item?.baseUrl === 'string' &&
        typeof item?.model === 'string' &&
        item.name.trim() !== '' &&
        item.baseUrl.trim() !== '',
    )
  } catch {
    return []
  }
}

/** 记下最近用过的 8 个，同名的用新的覆盖 */
export function rememberProvider(item: SavedProvider) {
  const name = item.name.trim()
  if (name === '' || item.baseUrl.trim() === '') return
  const rest = loadSavedProviders().filter((saved) => saved.name !== name)
  localStorage.setItem(
    SAVED_KEY,
    JSON.stringify([{ ...item, name }, ...rest].slice(0, 8)),
  )
}

/** 地址和模型名填了就够发起请求；本机模型的 key 可以空着 */
export function isConfigured(config: AiConfig) {
  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const hasKey = config.apiKey.trim() !== '' || provider?.keyOptional === true
  return config.baseUrl.trim() !== '' && config.model.trim() !== '' && hasKey
}

/** 还差哪几样：设置页顶上那条状态要用它说人话 */
export function missingFields(config: AiConfig) {
  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const missing: string[] = []
  if (config.baseUrl.trim() === '') missing.push('服务地址')
  if (config.model.trim() === '') missing.push('模型名')
  if (config.apiKey.trim() === '' && provider?.keyOptional !== true) missing.push('API Key')
  return missing
}

/** 能不能点「测试连接」：只要地址和模型名够发请求就行 */
export function canTest(config: AiConfig) {
  return config.baseUrl.trim() !== '' && config.model.trim() !== ''
}
