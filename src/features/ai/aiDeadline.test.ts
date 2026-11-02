/**
 * AI 请求的期限与取消合流。
 *
 * 盯的是「服务商连上却一直不回话，界面转到天荒地老」和「组件都卸载了请求还挂着」。
 * 用例只用真东西：AbortController、定时器、fetch 的 signal ——
 * 不碰主进程那条 IPC（那里另有期限与 ai:cancel），所以不用假窗口。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAiDeadline } from './aiDeadline'

const HOUR = 3_600_000

describe('startAiDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('调用方没给信号时，到点自己中止', () => {
    const deadline = startAiDeadline(undefined, 1000)
    expect(deadline.signal.aborted).toBe(false)
    expect(deadline.why()).toBe(null)

    vi.advanceTimersByTime(1000)

    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.why()).toBe('timeout')
    deadline.done()
  })

  it('调用方先响就算取消，不算超时', () => {
    const caller = new AbortController()
    const deadline = startAiDeadline(caller.signal, HOUR)

    caller.abort()

    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.why()).toBe('cancelled')
    deadline.done()
  })

  it('交进来的信号早就响过，第一次就拿得到中止', () => {
    const caller = new AbortController()
    caller.abort()

    const deadline = startAiDeadline(caller.signal, HOUR)

    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.why()).toBe('cancelled')
    deadline.done()
  })

  it('done() 之后定时器不再咬人，重复 done() 也不炸', () => {
    const caller = new AbortController()
    const deadline = startAiDeadline(caller.signal, 1000)
    deadline.done()
    deadline.done()

    vi.advanceTimersByTime(HOUR)

    expect(deadline.signal.aborted).toBe(false)
    expect(deadline.why()).toBe(null)

    // 撤了监听：请求已经结束了，迟到的取消不该再改动结果
    caller.abort()
    expect(deadline.why()).toBe(null)
  })

  it('fetch 收到的是同一个 signal：真中止能把它打断', async () => {
    const deadline = startAiDeadline(undefined, 500)
    const fetcher = vi.fn(async (init: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('不该等到这里')), HOUR)
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('This operation was aborted'))
        })
      })
    })

    const pending = fetcher({ signal: deadline.signal })
    vi.advanceTimersByTime(500)

    await expect(pending).rejects.toThrow('aborted')
    expect(deadline.why()).toBe('timeout')
    deadline.done()
  })
})
