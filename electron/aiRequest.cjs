// AI 请求的期限与取消。
//
// 主进程替渲染层发 AI 请求，socket 在它手里：服务商连上却一直不回话时，
// 界面会一直 busy，用户只能重启应用。所以这里给每一趟请求挂上兜底定时器，
// 同时留一个按流水号取消的口子（渲染层卸载组件或用户点停）。
// 做成不依赖 electron 的纯逻辑，是为了拿假 fetch 就能把「超时 / 取消 / 别泄露」跑一遍，不用起窗口。

/**
 * 兜底期限，只负责「连接挂住时别永远挂着」，不是性能目标。
 * 文字请求放到 5 分钟：开着深度思考的模型真能跑几分钟，卡在 60 秒误杀一次，
 * 用户只会觉得功能坏了；模型列表是个廉价 GET，20 秒足够。
 * 待标定：日志里 AI 请求完成那条的耗时攒够一批之后，再把 5 分钟收紧。
 */
const CHAT_TIMEOUT_MS = 300_000
const MODELS_TIMEOUT_MS = 20_000

/** 在飞的请求：requestId → { controller, reason }；请求结束一定要从这张表里摘掉 */
const inFlight = new Map()

/**
 * 发一趟带期限的 fetch。
 * run 拿到 signal，用它去 fetch；返回的 aborted 为 null 表示没被中止，
 * 否则是 'timeout'（到点）或 'cancelled'（渲染层喊停）。
 */
async function withAiRequest(rawId, timeoutMs, run) {
  const id = String(rawId ?? '')
  const entry = { controller: new AbortController(), reason: null }
  // 没带流水号的请求只能等它自然结束，取消不了
  if (id) inFlight.set(id, entry)

  const started = Date.now()
  const timer = setTimeout(() => {
    entry.reason = 'timeout'
    entry.controller.abort()
  }, timeoutMs)

  try {
    const value = await run(entry.controller.signal)
    return { value, ms: Date.now() - started, aborted: entry.reason }
  } catch (error) {
    // 中止也会走到这里：signal 一响，fetch 抛 AbortError
    return { error, ms: Date.now() - started, aborted: entry.reason ?? (entry.controller.signal.aborted ? 'cancelled' : null) }
  } finally {
    clearTimeout(timer)
    if (id && inFlight.get(id) === entry) inFlight.delete(id)
  }
}

/** 渲染层取消某一次请求；已经不在飞了返回 false */
function cancelAiRequest(rawId) {
  const entry = inFlight.get(String(rawId ?? ''))
  if (!entry) return false
  entry.reason = 'cancelled'
  entry.controller.abort()
  return true
}

/** 中止了就该给出中止的原因，别让它冒充网络故障 */
function abortResult(aborted, ms) {
  const cancelled = aborted === 'cancelled'
  return {
    ok: false,
    status: 0,
    body: '',
    ms,
    cancelled,
    error: cancelled ? '请求已取消' : `等待超时（${Math.round(ms / 1000)} 秒）`,
  }
}

module.exports = {
  CHAT_TIMEOUT_MS,
  MODELS_TIMEOUT_MS,
  abortResult,
  cancelAiRequest,
  withAiRequest,
}
