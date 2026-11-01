/**
 * 「深度思考」开关。
 *
 * 存在 localStorage，跟模型配置一样不进数据库。
 * 打开后做两件事：
 *   1. 给助手提示词加一句「先想清楚再动手」；
 *   2. 对明确支持的厂商再带上各自的推理参数（Ollama 的 think、
 *      硅基流动 / 通义千问的 enable_thinking），别的厂商不瞎传，
 *      免得一个不认识的字段换回 400。
 */
const KEY = 'sb_ai_reasoning_v1'

export function loadReasoning(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveReasoning(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // localStorage 不可用时只影响下一次打开，不影响本次
  }
}

/** 这次请求要不要带厂商的推理参数；没有就返回空对象 */
export function reasoningFields(
  providerId: string,
  enabled: boolean,
): Record<string, unknown> {
  if (!enabled) return {}
  if (providerId === 'ollama') return { think: true }
  if (providerId === 'siliconflow' || providerId === 'qwen') {
    return { enable_thinking: true }
  }
  return {}
}
