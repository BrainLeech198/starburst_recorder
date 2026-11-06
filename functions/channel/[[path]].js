/* global Request, Response, URL */
/**
 * Fixed-route facade for the public channel and administrator APIs.
 *
 * Keep this route list explicit: the Pages Function is not a general-purpose proxy.
 * CHANNEL_SERVICE is a Cloudflare Pages service binding to the existing starburst-push Worker.
 */
const ROUTES = new Map([
  ['notices', new Set(['GET'])],
  ['subscribe-email', new Set(['POST'])],
  ['unsubscribe-email', new Set(['POST'])],
  ['subscription', new Set(['GET'])],
  ['feedback', new Set(['POST'])],
  ['feedback/history', new Set(['POST'])],
  ['admin/session', new Set(['POST'])],
  ['admin/api/status', new Set(['GET'])],
  ['admin/api/notices', new Set(['GET', 'POST'])],
  ['admin/api/messages', new Set(['POST'])],
  ['admin/api/subscribers', new Set(['GET'])],
  ['admin/api/feedback', new Set(['GET'])],
])

function allowedMethods(route) {
  const exact = ROUTES.get(route)
  if (exact) return exact
  if (/^admin\/api\/notices\/[^/]+$/.test(route)) return new Set(['PUT', 'DELETE'])
  if (/^admin\/api\/feedback\/[^/]+$/.test(route)) return new Set(['PUT'])
  return undefined
}

export async function onRequest({ request, params, env }) {
  const segments = Array.isArray(params.path) ? params.path : [params.path]
  const route = segments.filter(Boolean).join('/')
  const methods = allowedMethods(route)

  if (!methods) return Response.json({ error: 'not found' }, { status: 404 })
  if (request.method !== 'OPTIONS' && !methods.has(request.method)) {
    return Response.json({ error: 'method not allowed' }, { status: 405 })
  }
  if (!env.CHANNEL_SERVICE) {
    return Response.json({ error: 'channel service unavailable' }, { status: 503 })
  }

  const upstreamUrl = new URL(request.url)
  upstreamUrl.pathname = `/${route}`
  return env.CHANNEL_SERVICE.fetch(new Request(upstreamUrl, request))
}
