/* global Request, Response, URL */
import { describe, expect, it, vi } from 'vitest'
import { onRequest } from './[[path]].js'

describe('Pages channel facade', () => {
  it('rewrites a whitelisted request to the existing Worker route', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    const body = JSON.stringify({ body: 'test feedback' })
    const request = new Request(
      'https://starburst-recorder.pages.dev/channel/feedback?source=app',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
        body,
      },
    )

    const response = await onRequest({
      request,
      params: { path: ['feedback'] },
      env: { CHANNEL_SERVICE: { fetch } },
    })

    const forwarded = fetch.mock.calls[0][0]
    expect(response.status).toBe(200)
    expect(new URL(forwarded.url).pathname).toBe('/feedback')
    expect(new URL(forwarded.url).search).toBe('?source=app')
    expect(forwarded.headers.get('Origin')).toBe('https://localhost')
    expect(await forwarded.text()).toBe(body)
  })

  it('rejects unknown routes and methods before calling the Worker', async () => {
    const fetch = vi.fn()
    const env = { CHANNEL_SERVICE: { fetch } }

    const unknown = await onRequest({
      request: new Request('https://starburst-recorder.pages.dev/channel/proxy-anywhere'),
      params: { path: ['proxy-anywhere'] },
      env,
    })
    const wrongMethod = await onRequest({
      request: new Request('https://starburst-recorder.pages.dev/channel/feedback'),
      params: { path: ['feedback'] },
      env,
    })

    expect(unknown.status).toBe(404)
    expect(wrongMethod.status).toBe(405)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards CORS preflight to the Worker route', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    const request = new Request('https://starburst-recorder.pages.dev/channel/feedback', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    const response = await onRequest({
      request,
      params: { path: ['feedback'] },
      env: { CHANNEL_SERVICE: { fetch } },
    })

    expect(response.status).toBe(204)
    expect(new URL(fetch.mock.calls[0][0].url).pathname).toBe('/feedback')
  })
})
