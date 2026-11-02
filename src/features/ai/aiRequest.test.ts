/**
 * 主进程 AI 请求的期限与取消。
 *
 * 盯的三件事：挂住的连接要按时断掉、渲染层喊停要真的停、两样都不能在在飞表里留残项
 * （留了就是内存泄漏，而且下一个同号请求会被莫名取消）。
 * 用真定时器 + 几十毫秒的期限，不用假时钟：这里要验的是「会不会等到」，不是等了多少毫秒。
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const ai = require('../../../electron/aiRequest.cjs') as {
  CHAT_TIMEOUT_MS: number
  MODELS_TIMEOUT_MS: number
  abortResult: (aborted: string, ms: number) => { ok: boolean; status: number; body: string; ms: number; cancelled: boolean; error: string }
  cancelAiRequest: (id: string) => boolean
  withAiRequest: <T>(id: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) => Promise<{
    value?: T
    error?: unknown
    ms: number
    aborted: string | null
  }>
}

/** 服务商连上却不回话：promise 永远挂着，只有 signal 能把它叫醒 */
function hangingFetch(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
  })
}

describe('withAiRequest 期限', () => {
  it('到点就断，并说是超时', async () => {
    const outcome = await ai.withAiRequest('req-timeout', 30, hangingFetch)

    expect(outcome.aborted).toBe('timeout')
    expect(outcome.error).toBeInstanceOf(Error)
    expect(outcome.ms).toBeGreaterThanOrEqual(25)
    // 请求已经结束了，不该还能被取消
    expect(ai.cancelAiRequest('req-timeout')).toBe(false)
  })

  it('顺利回来时不带中止标记，值原样交出', async () => {
    const outcome = await ai.withAiRequest('req-ok', 5_000, async () => ({ status: 200 }))

    expect(outcome.aborted).toBe(null)
    expect(outcome.value).toEqual({ status: 200 })
    expect(outcome.error).toBeUndefined()
  })

  it('服务商没应答之外的报错不算中止', async () => {
    const outcome = await ai.withAiRequest('req-fail', 5_000, async () => {
      throw new Error('fetch failed')
    })

    expect(outcome.aborted).toBe(null)
    expect((outcome.error as Error).message).toBe('fetch failed')
  })

  it('没带流水号也能跑，只是取消不了', async () => {
    const outcome = await ai.withAiRequest('', 30, hangingFetch)

    expect(outcome.aborted).toBe('timeout')
    expect(ai.cancelAiRequest('')).toBe(false)
  })
})

describe('cancelAiRequest', () => {
  it('取消正在飞的那一次，signal 真的响了', async () => {
    let seen: AbortSignal | null = null
    const pending = ai.withAiRequest('req-cancel', 60_000, (signal) => {
      seen = signal
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
      })
    })

    expect(ai.cancelAiRequest('req-cancel')).toBe(true)
    const outcome = await pending

    expect((seen as unknown as AbortSignal | null)?.aborted).toBe(true)
    expect(outcome.aborted).toBe('cancelled')
    expect(ai.cancelAiRequest('req-cancel')).toBe(false)
  })

  it('两个号各管各的，取消一个不碰另一个', async () => {
    let first: AbortSignal | null = null
    let second: AbortSignal | null = null
    const a = ai.withAiRequest('A', 60_000, (signal) => {
      first = signal
      return new Promise<never>((_r, reject) => signal.addEventListener('abort', () => reject(new Error('AbortError'))))
    })
    const b = ai.withAiRequest('B', 60_000, (signal) => {
      second = signal
      return new Promise<never>((_r, reject) => signal.addEventListener('abort', () => reject(new Error('AbortError'))))
    })

    ai.cancelAiRequest('A')

    expect((await a).aborted).toBe('cancelled')
    expect((first as unknown as AbortSignal).aborted).toBe(true)
    expect((second as unknown as AbortSignal).aborted).toBe(false)

    ai.cancelAiRequest('B')
    expect((await b).aborted).toBe('cancelled')
  })

  it('认不出来的号不给取消', () => {
    expect(ai.cancelAiRequest('never-sent')).toBe(false)
    expect(ai.cancelAiRequest('')).toBe(false)
    expect(ai.cancelAiRequest(String(undefined))).toBe(false)
  })
})

describe('abortResult', () => {
  it('取消与超时分开说，取消还带标记', () => {
    const cancelled = ai.abortResult('cancelled', 1234)
    expect(cancelled.ok).toBe(false)
    expect(cancelled.status).toBe(0)
    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.error).toBe('请求已取消')

    const timeout = ai.abortResult('timeout', 300_000)
    expect(timeout.cancelled).toBe(false)
    expect(timeout.error).toContain('300 秒')
  })

  it('两个默认期限都在合理量级', () => {
    // 文字请求要容得下深度思考，模型列表是廉价 GET；数字改动要能说清为什么
    expect(ai.CHAT_TIMEOUT_MS).toBe(300_000)
    expect(ai.MODELS_TIMEOUT_MS).toBe(20_000)
  })
})
