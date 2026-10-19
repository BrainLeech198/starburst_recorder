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
import { desktopBridge } from '../../core/desktop'
import type { ChatRequest, ChatTransportResult } from '../../core/desktop'
import type { AiConfig } from './aiConfig'

/** 地址可能带结尾斜杠，统一拼成 chat/completions */
export function chatUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
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

/** 发一次请求，返回统一信封 */
export async function chat(request: ChatRequest): Promise<ChatTransportResult> {
  const bridge = desktopBridge()
  if (bridge) return bridge.chat(request)

  const apiKey = request.apiKey.trim() || 'ollama' // 本机模型不校验 key，给个占位免得服务端报空
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    // 小米 MiMo 的文档里用的是 api-key 头，两个都带上，省得对不上
    'api-key': apiKey,
  }
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

const TEST_PROMPT = '你好，请用一句话简单回应一下。'

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
    return { ok: false, reply: '', ms: result.ms, steps }
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
    return { ok: false, reply: '', ms: result.ms, steps }
  }

  if (result.status === 429) {
    steps.push({
      ok: false,
      title: '第 3 步 · 密钥',
      detail: 'key 是认的，但被限流或者余额不够了（429）。等一会儿再试，或者去控制台看看额度。',
    })
    return { ok: false, reply: '', ms: result.ms, steps }
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
    return { ok: false, reply: '', ms: result.ms, steps }
  }

  steps.push({ ok: true, title: '第 4 步 · 模型', detail: `「${model}」回话了，这条路通了。` })
  return { ok: true, reply, ms: result.ms, steps }
}
