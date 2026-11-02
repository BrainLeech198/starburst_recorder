/**
 * AI 请求的期限与取消。
 *
 * 两路信号合成一路：调用方的（用户点停、组件卸载）和自家兜底定时器（服务商连上却一直不回话）。
 * 没有用 AbortSignal.any / AbortSignal.timeout——旧版安卓 WebView 上还没有这两个东西，
 * 手工接一个 AbortController 换来全平台一致行为，代价是调用方必须 done() 撤掉定时器。
 */

/** 这一趟是被什么打断的 */
export type AiAbortWhy = 'timeout' | 'cancelled'

/** 主进程的定时器归 main.cjs 那份同名常量管，这里是渲染层直连与开发转发那两条路 */
export const AI_CHAT_TIMEOUT_MS = 300_000
export const AI_MODELS_TIMEOUT_MS = 20_000

export interface AiDeadline {
  /** 交给 fetch 用 */
  signal: AbortSignal
  /** 被谁打断；还没打断是 null */
  why(): AiAbortWhy | null
  /** 请求结束（成功、失败、取消都算）后调用：撤定时器与监听 */
  done(): void
}

export function startAiDeadline(caller: AbortSignal | undefined, timeoutMs: number): AiDeadline {
  const controller = new AbortController()
  let stopped: AiAbortWhy | null = null

  const abortByCaller = () => {
    stopped = 'cancelled'
    controller.abort()
  }
  if (caller?.aborted) abortByCaller()
  else caller?.addEventListener('abort', abortByCaller)

  const timer = setTimeout(() => {
    stopped = 'timeout'
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    why: () => stopped,
    done() {
      clearTimeout(timer)
      caller?.removeEventListener('abort', abortByCaller)
    },
  }
}
