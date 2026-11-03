/**
 * PWA 的 Service Worker：让「添加到主屏幕」的网页版能离线打开、并且装上图标。
 *
 * 三个刻意的设计：
 *
 * 1. **预缓存靠解析入口 HTML**。带哈希的资源名（`assets/index-xxxx.js`）构建时才生成，
 *    写不进这份静态文件，所以 install 时抓一次入口 HTML，把它引用的 JS / CSS / 图标
 *    一并缓存。字体（CSS 里 `url()` 引用的 woff2）不在这条链上，由运行时缓存补齐；
 *    断网时最多退回系统字体，不影响使用。
 *
 * 2. **导航走「网络优先」**。HTML 永远先问服务器，拿到新版本就换新的哈希资源；
 *    断网才退回缓存。这样部署完新版本，用户下次打开就是新版，不会吃到旧壳。
 *    静态资源走「先给缓存、后台更新」，因为文件名带哈希，内容不会变，缓存永远安全。
 *
 * 3. **不碰跨域请求**。AI 对话直接打第三方 API，那些请求不能被缓存，
 *    否则会把一次失败的响应永久留在缓存里。
 *
 * `__BUILD_ID__` 由 vite.config.ts 里的插件在构建时替换成唯一值，
 * 只用来给缓存起名、在 activate 时清掉上一版——不换这个值，老缓存永远不会被回收。
 */
const BUILD = '__BUILD_ID__'
const CACHE = `starburst-${BUILD}`
const SCOPE = self.registration.scope
const ICON = './icons/icon-192.png'

/** 带哈希的构建产物与静态图片：内容不可变，缓存优先 */
function isImmutableAsset(url) {
  return url.pathname.includes('/assets/') || /\.(?:woff2?|png|webp|svg|ico)$/i.test(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(SCOPE, { cache: 'reload' })
        const html = await response.clone().text()
        await cache.put(SCOPE, response)

        // 入口 HTML 里引用的带哈希资源必须一起预缓存。
        // 首次访问时 SW 还没接管页面，那些 JS / CSS 请求不经过 fetch 事件、也就不会被缓存；
        // 用户装完主屏幕立刻断网，就会出现「HTML 有、JS 没有」的白屏。
        const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
          .map((match) => new URL(match[1], SCOPE))
          .filter(
            (url) =>
              url.origin === self.location.origin &&
              (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')),
          )
        await Promise.allSettled(assets.map((url) => cache.add(url.toString())))
      } catch {
        // 首次安装时网络抖一下就让它装上：下次导航还能补缓存，别把安装卡死
      }
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('starburst-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      )
      // 首次安装时立刻接管页面，否则要等下一次导航才能离线
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) await cache.put(SCOPE, fresh.clone())
    return fresh
  } catch {
    const cached = (await cache.match(request)) || (await cache.match(SCOPE))
    if (cached) return cached
    return new Response('', { status: 504, statusText: 'offline' })
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  if (cached) return cached
  const response = await network
  return response || new Response('', { status: 504, statusText: 'offline' })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 跨域一律放行：AI 接口、更新检查、外部链接都不归这里管
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  if (isImmutableAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

/**
 * Web Push：服务端到点推一条，这里只负责显示。
 *
 * 文案是订阅时客户端交上去的通用版本，不含任何用户内容——服务端不知道
 * 「9:30 看牙医」，只知道「9:30 有一条日程提醒」。
 */
/** 读服务端推来的 JSON；非 JSON、空载荷、或者不是对象，一律退回默认文案 */
function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  event.waitUntil(
    self.registration.showNotification(payload.title || '星芒记录者', {
      body: payload.body || '',
      icon: ICON,
      badge: ICON,
      // 同一个 tag：新提醒覆盖旧的，不在通知中心堆一列
      tag: payload.tag || 'starburst',
      data: { url: payload.url || SCOPE },
    }),
  )
})

/** 点通知：已经开着就切回前台，没开就新开一个窗口 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || SCOPE
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
