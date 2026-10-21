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
    include: ['src/**/*.test.ts'],
  },
})
