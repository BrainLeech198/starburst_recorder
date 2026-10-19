import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
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
      server.middlewares.use('/__ai', async (req, res) => {
        const started = Date.now()
        /** 统一回同一个信封，前端那边就只用写一套解析逻辑 */
        const send = (payload: unknown) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(payload))
        }

        const target = String(req.headers['x-ai-target'] ?? '')
        if (!/^https?:\/\//i.test(target)) {
          send({ ok: false, status: 0, body: '', ms: 0, error: '请求头里没有目标地址' })
          return
        }

        const raw = await new Promise<string>((resolve) => {
          const parts: string[] = []
          req.on('data', (chunk) => parts.push(String(chunk)))
          req.on('end', () => resolve(parts.join('')))
        })

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        const auth = req.headers.authorization
        if (auth) headers.Authorization = String(auth)
        const apiKey = req.headers['api-key']
        if (apiKey) headers['api-key'] = String(apiKey)

        try {
          const upstream = await fetch(target, { method: 'POST', headers, body: raw })
          send({
            ok: upstream.ok,
            status: upstream.status,
            body: await upstream.text(),
            ms: Date.now() - started,
          })
        } catch (error) {
          send({
            ok: false,
            status: 0,
            body: '',
            ms: Date.now() - started,
            error: (error as Error).message,
          })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), aiDevProxy()],
  // 桌面壳（Electron/Tauri）用 file:// 或自定义协议打开 index.html，
  // 资源必须走相对路径，否则绝对路径 /assets/... 会 404
  base: './',
  build: {
    target: 'es2021',
  },
})
