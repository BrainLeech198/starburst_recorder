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

  it('forwards only the explicit administrator routes and methods', async () => {
    const routes = [
      ['admin/session', 'POST'],
      ['admin/api/status', 'GET'],
      ['admin/api/notices', 'GET'],
      ['admin/api/notices', 'POST'],
      ['admin/api/notices/notice-1', 'PUT'],
      ['admin/api/notices/notice-1', 'DELETE'],
      ['admin/api/messages', 'POST'],
      ['admin/api/subscribers', 'GET'],
      ['admin/api/feedback', 'GET'],
      ['admin/api/feedback/fb-123', 'PUT'],
      ['feedback/history', 'POST'],
    ]
    const fetch = vi.fn(async () => Response.json({ ok: true }))

    for (const [route, method] of routes) {
      const response = await onRequest({
        request: new Request(`https://starburst-recorder.pages.dev/channel/${route}`, {
          method,
          headers: {
            Origin: 'https://brainleech198.github.io',
            ...(method === 'POST' || method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
            ...(route !== 'admin/session' ? { Authorization: 'Bearer session-token' } : {}),
          },
          ...(['POST', 'PUT'].includes(method) ? { body: JSON.stringify({ ok: true }) } : {}),
        }),
        params: { path: route.split('/') },
        env: { CHANNEL_SERVICE: { fetch } },
      })
      expect(response.status).toBe(200)
      expect(new URL(fetch.mock.calls.at(-1)[0].url).pathname).toBe(`/${route}`)
    }

    expect(fetch).toHaveBeenCalledTimes(routes.length)
  })

  it('rejects unlisted administrator routes before invoking the Worker', async () => {
    const fetch = vi.fn()
    const response = await onRequest({
      request: new Request('https://starburst-recorder.pages.dev/channel/admin/api/secrets'),
      params: { path: ['admin', 'api', 'secrets'] },
      env: { CHANNEL_SERVICE: { fetch } },
    })

    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
})
