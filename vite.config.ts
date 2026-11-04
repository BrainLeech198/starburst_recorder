import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 浏览器开发调试时的 AI 转发。
 *
 * 浏览器的跨域策略会拦掉直连第三方 API 的请求，桌面程序不受影响（它从 Electron 主进程发）。
 * 目标地址刻意不写在这里，而是从请求头 X-AI-Target 读——这样在设置页里随便改服务地址，
 * 都不用重启 dev server。这一层只在开发时存在，打包产物里没有它。
 */
function aiDevProxy(): Plugin {
  return {
    name: 'starburst-ai-dev-proxy',
    configureServer(server) {
      /** 统一回同一个信封，前端那边就只用写一套解析逻辑 */
      const send = (res: import('node:http').ServerResponse, payload: unknown) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(payload))
      }

      /** POST 走对话，GET 走模型列表；目标地址都从请求头拿 */
      const forward = async (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
        method: 'GET' | 'POST',
      ) => {
        const started = Date.now()
        const target = String(req.headers['x-ai-target'] ?? '')
        if (!/^https?:\/\//i.test(target)) {
          send(res, { ok: false, status: 0, body: '', ms: 0, error: '请求头里没有目标地址' })
          return
        }

        const raw =
          method === 'POST'
            ? await new Promise<string>((resolve) => {
                const parts: string[] = []
                req.on('data', (chunk) => parts.push(String(chunk)))
                req.on('end', () => resolve(parts.join('')))
              })
            : undefined

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        const auth = req.headers.authorization
        if (auth) headers.Authorization = String(auth)
        const apiKey = req.headers['api-key']
        if (apiKey) headers['api-key'] = String(apiKey)

        const controller = new AbortController()
        const abortOnClose = () => controller.abort()
        res.once('close', abortOnClose)
        try {
          const upstream = await fetch(target, { method, headers, body: raw, signal: controller.signal })
          if (
            method === 'POST' &&
            upstream.ok &&
            upstream.body &&
            upstream.headers.get('content-type')?.includes('text/event-stream')
          ) {
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('X-Accel-Buffering', 'no')
            const reader = upstream.body.getReader()
            while (!res.destroyed) {
              const { done, value } = await reader.read()
              if (done) break
              if (!res.write(Buffer.from(value))) {
                await new Promise<void>((resolve) => res.once('drain', resolve))
              }
            }
            if (!res.destroyed) res.end()
            return
          }
          send(res, {
            ok: upstream.ok,
            status: upstream.status,
            body: await upstream.text(),
            ms: Date.now() - started,
          })
        } catch (error) {
          if (res.destroyed || res.headersSent) return
          send(res, {
            ok: false,
            status: 0,
            body: '',
            ms: Date.now() - started,
            error: (error as Error).message,
          })
        } finally {
          res.removeListener('close', abortOnClose)
        }
      }

      // 长路径要先注册，否则会被 /__ai 这个前缀先吃掉
      server.middlewares.use('/__ai/models', (req, res) => void forward(req, res, 'GET'))
      server.middlewares.use('/__ai', (req, res) => void forward(req, res, 'POST'))
    },
  }
}

/**
 * 把 `public/sw.js` 里的 `__BUILD_ID__` 换成这次构建的唯一值。
 *
 * 为什么必须有这一步：Service Worker 用这个 id 给缓存起名，activate 时清掉所有
 * 名字对不上的旧缓存。id 固定的话，改完代码部署上去，老用户的旧缓存永远留在磁盘上
 * （体积只增不减），而且排查问题时没法判断他到底跑的是哪一版。
 *
 * 用 `closeBundle` 是因为 Vite 要先把 `public/` 原样拷进产物目录，这里再覆盖一次。
 */
function serviceWorkerBuildId(): Plugin {
  return {
    name: 'starburst-sw-build-id',
    apply: 'build',
    closeBundle() {
      const target = fileURLToPath(new URL('./.local/dist/sw.js', import.meta.url))
      if (!existsSync(target)) return
      const source = readFileSync(target, 'utf8')
      if (!source.includes('__BUILD_ID__')) return
      // 时间戳比内容哈希便宜：SW 文件几乎每次都跟着改，不必为它多算一遍全量哈希
      writeFileSync(target, source.replace(/__BUILD_ID__/g, Date.now().toString(36)), 'utf8')
    },
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  plugins: [react(), tailwindcss(), aiDevProxy(), serviceWorkerBuildId()],
  // 版本号只认 package.json，页面与检查更新都用 __APP_VERSION__
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // 桌面壳（Electron/Tauri）用 file:// 或自定义协议打开 index.html，
  // 资源必须走相对路径，否则绝对路径 /assets/... 会 404
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2021',
    // 产物跟安装包、截图一起放 .local/，仓库根目录只留源码和配置
    outDir: '.local/dist',
    emptyOutDir: true,
  },
})
