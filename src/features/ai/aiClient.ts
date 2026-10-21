/**
 * AI 请求的唯一出口。
 *
 * 三条路，但出口只有这一个函数，所以以后接手机端只需要在这里加一支：
 *   1. 桌面程序   → 走 Electron 主进程（没有 CORS 这回事，key 也不进渲染进程的网络栈）
 *   2. 浏览器开发 → 走 vite 的 /__ai 转发（目标地址放在请求头里，改地址不用重启 dev server）
 *   3. 其它环境   → 浏览器直连兜底
 *
 * 另外这里负责把服务商的原始错误翻译成人话——401、404、429 对新用户来说全是天书。
 */
import { desktopBridge } from '@/platform/desktop'
import type { ChatContentPart, ChatRequest, ChatTransportResult } from '@/platform/desktop'
import type { AiConfig } from './aiConfig'

/** 地址可能带结尾斜杠，统一拼成 chat/completions */
export function chatUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

/** 模型列表：OpenAI 兼容接口是 {baseUrl}/models */
export function modelsUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/models`
}

/** 从 OpenAI 形状的响应里抠出正文，抠不到就返回空串 */
export function pickReply(body: string) {
  try {
    const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  } catch {
    return ''
  }
}

/** 服务商认的两种密钥头都带上；本机模型不校验 key，给个占位免得服务端报空 */
function authHeaders(apiKey: string) {
  const key = apiKey.trim() || 'ollama'
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    // 小米 MiMo 的文档里用的是 api-key 头，两个都带上，省得对不上
    'api-key': key,
  }
}

/** 发一次请求，返回统一信封 */
export async function chat(request: ChatRequest): Promise<ChatTransportResult> {
  const bridge = desktopBridge()
  if (bridge) return bridge.chat(request)

  const headers = authHeaders(request.apiKey)
  const body = JSON.stringify({ model: request.model, messages: request.messages, stream: false })
  const started = Date.now()

  try {
    if (import.meta.env.DEV) {
      const response = await fetch('/__ai', {
        method: 'POST',
        headers: { ...headers, 'x-ai-target': chatUrl(request.baseUrl) },
        body,
      })
      return (await response.json()) as ChatTransportResult
    }
    const response = await fetch(chatUrl(request.baseUrl), { method: 'POST', headers, body })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      ms: Date.now() - started,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      ms: Date.now() - started,
      error: (error as Error).message,
    }
  }
}

/** 模型列表的结论：拉不到不算错，用户始终可以自己填 */
export interface ModelListResult {
  ok: boolean
  models: string[]
  /** 拉不到时的人话原因，成功时为空串 */
  error: string
  ms: number
}

/**
 * 从 /models 的返回里把模型名抠出来。
 *
 * 各家的形状并不统一：OpenAI 是 data[].id，Ollama 是 models[].name，
 * 还有的会再套一层数组或者把字段叫 model。所以这里不做固定结构的假设，
 * 只在数组里认 id / name / model 三个字段（以及字符串数组），别的一律忽略。
 */
export function parseModelList(body: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return []
  }

  const names = new Set<string>()
  const add = (value: string) => {
    const name = value.trim()
    if (name !== '' && name.length <= 200) names.add(name)
  }

  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === 'string') {
          add(item)
          continue
        }
        if (item === null || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        for (const key of ['id', 'name', 'model']) {
          if (typeof record[key] === 'string') add(record[key] as string)
        }
      }
      return
    }
    for (const value of Object.values(node as Record<string, unknown>)) visit(value, depth + 1)
  }

  visit(data, 0)
  return [...names].sort()
}

/**
 * 拉服务商在卖哪些模型，给设置页的下拉用。
 * 失败不抛错：模型名本来就可以手填，这只是个便利。
 */
export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelListResult> {
  const url = modelsUrl(baseUrl)
  const bridge = desktopBridge()
  const started = Date.now()

  let result: ChatTransportResult
  if (bridge) {
    result = await bridge.models({ baseUrl, apiKey })
  } else {
    try {
      const headers = authHeaders(apiKey)
      const response = import.meta.env.DEV
        ? await fetch('/__ai/models', { headers: { ...headers, 'x-ai-target': url } })
        : await fetch(url, { headers })
      result = import.meta.env.DEV
        ? ((await response.json()) as ChatTransportResult)
        : {
            ok: response.ok,
            status: response.status,
            body: await response.text(),
            ms: Date.now() - started,
          }
    } catch (error) {
      result = {
        ok: false,
        status: 0,
        body: '',
        ms: Date.now() - started,
        error: (error as Error).message,
      }
    }
  }

  if (!result.ok) {
    return { ok: false, models: [], error: modelsHint(result, baseUrl), ms: result.ms }
  }
  const models = parseModelList(result.body)
  return {
    ok: models.length > 0,
    models,
    error: models.length > 0 ? '' : '服务商返回里没有可用的模型名，可以自己填。',
    ms: result.ms,
  }
}

/** 一步诊断的结论 */
export interface DiagnoseStep {
  /** 第几步、在查什么 */
  title: string
  /** 查的结果，用中文说清楚，并给出下一步怎么办 */
  detail: string
  ok: boolean
}

export interface DiagnoseResult {
  ok: boolean
  steps: DiagnoseStep[]
  /** 模型回的那句话，通了才有 */
  reply: string
  ms: number
  /**
   * 这个模型能不能看图。
   * unknown 表示这次没测出来（网络、额度、服务商 5xx 之类），不代表不能用。
   */
  vision: 'yes' | 'no' | 'unknown'
}

/** 连不上时，按服务商给不同的排查方向 */
function networkHint(baseUrl: string, error?: string) {
  const why = error ? `（${error.slice(0, 120)}）` : ''
  if (/localhost|127\.0\.0\.1/i.test(baseUrl)) {
    return `连不上 ${baseUrl}${why}。本机模型要先启动，还要确认模型已经下载完。`
  }
  if (/api\.openai\.com/i.test(baseUrl)) {
    return `连不上 api.openai.com${why}。国内直连这个地址多半要挂代理，先确认代理开着，或者换一家国内的服务商。`
  }
  return `连不上 ${baseUrl}${why}。按顺序查三件事：地址有没有写错、这台机器能不能上外网、这家服务商是否需要代理。`
}

/** 服务商返回了 4xx/5xx，但页面读不出正文时，把原始返回带上 */
function bodyHint(body: string, fallback: string) {
  const raw = body.trim().slice(0, 200)
  return raw ? `${fallback}原始返回：${raw}` : fallback
}

/**
 * 真实功能（整理成日记这类）失败时，用同一套人话解释一遍。
 * 「测试连接」那边有分步诊断，这里是给别的入口复用的简版。
 */
export function explainFailure(result: ChatTransportResult, baseUrl: string) {
  if (result.status === 0) return networkHint(baseUrl, result.error)
  if (result.status === 401 || result.status === 403) {
    return `服务商不认这把 key（${result.status}）。去「设置 → AI 模型」重新复制一次 key。`
  }
  if (result.status === 429) return '被限流或者额度不够了（429），等一会儿再试。'
  if (result.status === 404 || result.status === 400) {
    return bodyHint(
      result.body,
      '服务商说这个请求它不认（多半是模型名不对）。去「设置 → AI 模型」核对一下模型名。',
    )
  }
  if (result.status >= 500) return `服务商那边自己出错了（${result.status}），过一会儿再试。`
  return bodyHint(result.body, `请求没成功（${result.status}）。`)
}

/**
 * 拉模型列表失败时的人话。
 * 跟对话失败分开说：404 在这里只代表「这家没开放模型列表」，不是模型名写错了。
 */
function modelsHint(result: ChatTransportResult, baseUrl: string) {
  if (result.status === 0) return networkHint(baseUrl, result.error)
  if (result.status === 401 || result.status === 403) {
    return `这家不认这把 key，或者 key 没有查看模型的权限（${result.status}）。不影响手填模型名。`
  }
  if (result.status === 404) {
    return '这家没开放模型列表接口（404），模型名在控制台复制后手填就行。'
  }
  if (result.status === 429) return '被限流或者额度不够了（429），等一会儿再刷新。'
  if (result.status >= 500) return `服务商那边自己出错了（${result.status}），过一会儿再刷新。`
  return bodyHint(result.body, `没拉到模型列表（${result.status}）。`)
}

const TEST_PROMPT = '你好，请用一句话简单回应一下。'

/** 兜底的 1×1 白色 PNG：浏览器画不出探针图时还能发出去 */
const FALLBACK_PROBE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * 给识图探测用的小图：64×64 白底黑 A。
 * 现画而不是塞一张 base64 大图，既省体积，也保证各家都认得出这是张正常图片。
 */
function probeImage() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return FALLBACK_PROBE
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', 32, 32)
    return canvas.toDataURL('image/png')
  } catch {
    return FALLBACK_PROBE
  }
}

/** 带一张小图问一句话：服务商收下了就说明这模型能看图 */
async function probeVision(config: AiConfig): Promise<'yes' | 'no' | 'unknown'> {
  const part: ChatContentPart = { type: 'image_url', image_url: { url: probeImage() } }
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '这张图里有一个字母，只回答这个字母。' }, part],
      },
    ],
  })
  // 网络、密钥、限流、服务商故障都跟「能不能看图」无关，别把锅扣在模型身上
  if (result.status === 0 || result.status === 401 || result.status === 403 || result.status === 429) {
    return 'unknown'
  }
  if (result.status >= 500) return 'unknown'
  if (!result.ok) return 'no'
  return 'yes'
}

/**
 * 「测试连接」：按顺序把四件事查一遍，卡在哪一步就直说，
 * 而不是把一个 401 原样丢给用户。
 */
export async function testConnection(config: AiConfig): Promise<DiagnoseResult> {
  const baseUrl = config.baseUrl.trim()
  const model = config.model.trim()

  if (baseUrl === '' || model === '') {
    return {
      ok: false,
      reply: '',
      ms: 0,
      vision: 'unknown',
      steps: [
        { ok: false, title: '第 1 步 · 填写', detail: '服务地址和模型名还没填全，先补上这两样。' },
      ],
    }
  }

  const steps: DiagnoseStep[] = [
    { ok: true, title: '第 1 步 · 填写', detail: `地址和模型名都有了，这次用「${model}」。` },
  ]

  const result = await chat({
    baseUrl,
    apiKey: config.apiKey.trim(),
    model,
    messages: [{ role: 'user', content: TEST_PROMPT }],
  })

  if (result.status === 0) {
    steps.push({ ok: false, title: '第 2 步 · 连接', detail: networkHint(baseUrl, result.error) })
    return { ok: false, reply: '', ms: result.ms, vision: 'unknown', steps }
  }

  steps.push({
    ok: true,
    title: '第 2 步 · 连接',
    detail: `连上服务器了，来回用了 ${result.ms} 毫秒。`,
  })

  if (result.status === 401 || result.status === 403) {
    steps.push({
      ok: false,
      title: '第 3 步 · 密钥',
      detail: `服务商不认这把 key（${result.status}）。去控制台重新复制一次，注意别漏字符、别把前后的空格一起粘进来。`,
    })
    return { ok: false, reply: '', ms: result.ms, vision: 'unknown', steps }
  }

  if (result.status === 429) {
    steps.push({
      ok: false,
      title: '第 3 步 · 密钥',
      detail: 'key 是认的，但被限流或者余额不够了（429）。等一会儿再试，或者去控制台看看额度。',
    })
    return { ok: false, reply: '', ms: result.ms, vision: 'unknown', steps }
  }

  steps.push({ ok: true, title: '第 3 步 · 密钥', detail: '服务商认下了这把 key。' })

  const reply = pickReply(result.body)

  if (!result.ok || reply === '') {
    const hint =
      result.status === 404 || result.status === 400
        ? `服务商说没有「${model}」这个模型（${result.status}）。去控制台把模型名原样复制过来，别自己拼。`
        : result.status >= 500
          ? `服务商那边自己出错了（${result.status}），过一会儿再试。`
          : `请求发出去了，但没拿回能读懂的内容（${result.status}）。`
    steps.push({ ok: false, title: '第 4 步 · 模型', detail: bodyHint(result.body, hint) })
    return { ok: false, reply: '', ms: result.ms, vision: 'unknown', steps }
  }

  steps.push({ ok: true, title: '第 4 步 · 模型', detail: `「${model}」回话了，这条路通了。` })

  // 第 5 步单独确认「能不能看图」：文字通不代表手写日记能导进来
  const vision = await probeVision(config)
  if (vision === 'yes') {
    steps.push({
      ok: true,
      title: '第 5 步 · 看图',
      detail: '能看懂图片，手写日记可以拍下来导进来。',
    })
  } else if (vision === 'no') {
    steps.push({
      ok: false,
      title: '第 5 步 · 看图',
      detail: '这个模型看不了图片。图片导入要换一个视觉模型，例如 qwen-vl-plus、gpt-4o-mini、mimo-vl。',
    })
  } else {
    steps.push({
      ok: false,
      title: '第 5 步 · 看图',
      detail: '这次没测出看图能力（网络或额度问题），不影响文字功能；图片导入可以等会儿再试。',
    })
  }

  return { ok: true, reply, ms: result.ms, vision, steps }
}
