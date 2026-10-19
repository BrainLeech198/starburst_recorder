import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 桌面壳（Electron/Tauri）用 file:// 或自定义协议打开 index.html，
  // 资源必须走相对路径，否则绝对路径 /assets/... 会 404
  base: './',
  build: {
    target: 'es2021',
  },
})
