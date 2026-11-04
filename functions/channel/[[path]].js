/* global Request, Response, URL */
/**
 * Same-origin facade for the public channel API.
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
])

export async function onRequest({ request, params, env }) {
  const segments = Array.isArray(params.path) ? params.path : [params.path]
  const route = segments.filter(Boolean).join('/')
  const methods = ROUTES.get(route)

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
