import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 手机端（Android）的 Capacitor 配置。
 *
 * 几个关键点：
 * - `appId` 跟桌面端打包用的 `build.appId` 保持一致，两个平台共用一个身份。
 * - `webDir` 是 Vite 的产物目录；打包流程就是 `npm run build` → `npx cap sync android`。
 * - 默认 `androidScheme` 是 `https`，也就是页面跑在 `https://localhost` 下——
 *   给了一个标准 origin，IndexedDB / fetch 这些都按常规工作（跟桌面端用 app:// 是同一个道理）。
 */
const config: CapacitorConfig = {
  appId: 'com.starburst.recorder',
  appName: '星芒记录者',
  webDir: 'dist',
  android: {
    // 开发期打开 WebView 的远程调试（chrome://inspect 能看到页面），正式发布前再看要不要关
    webContentsDebuggingEnabled: true,
  },
}

export default config
