import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('fetchNotices', () => {
  let fetchNotices: typeof import('./channel').fetchNotices
  let channel: typeof import('./channel')

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_CHANNEL_API', 'https://channel.example.test/channel')
    channel = await import('./channel')
    fetchNotices = channel.fetchNotices
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('成功的空列表与加载失败返回不同结果，GET 不附带 JSON 请求头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, notices: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchNotices()).resolves.toEqual({ ok: true, data: [] })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toBeUndefined()

    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    await expect(fetchNotices()).resolves.toMatchObject({ ok: false, error: 'http 503' })
  })

  it('拒绝不符合公告结构的响应，不把它当作空列表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, notices: [{ id: 42 }] }), { status: 200 }),
      ),
    )

    await expect(fetchNotices()).resolves.toEqual({ ok: false, error: 'bad response' })
  })

  it('反馈保留服务端错误原因，方便区分网络失败和接口拒绝', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'feedback store unavailable' }), { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(channel.submitFeedback('test')).resolves.toEqual({
      ok: false,
      error: 'feedback store unavailable',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('未覆盖频道地址时默认通过官方 Pages 代理', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_CHANNEL_API', '')
    const defaultChannel = await import('./channel')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 'feedback-1' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(defaultChannel.submitFeedback('test')).resolves.toMatchObject({ ok: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://starburst-recorder.pages.dev/channel/feedback',
    )
  })
})
