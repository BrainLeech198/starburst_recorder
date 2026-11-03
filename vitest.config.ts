import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单测只跑纯逻辑，不启动浏览器环境。
 * 需要 DOM 的模块（弹窗、滚动锁之类）不在这里测，免得为了几个函数拖一个 jsdom 进来。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // worker/ 是跑在 Cloudflare 上的推送中继，用 JS 写（Worker 不做 TS 构建），
    // 但里面的加密与时间换算同样需要单测——尤其是对 RFC 8291 官方样例的逐字节比对
    include: ['src/**/*.test.ts', 'worker/**/*.test.js'],
  },
})
