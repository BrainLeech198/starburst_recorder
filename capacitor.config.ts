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
  webDir: '.local/dist',
  android: {
    // 开发期打开 WebView 的远程调试（chrome://inspect 能看到页面），正式发布前再看要不要关
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    /**
     * Capacitor 8 自带的状态栏/导航栏处理（不需要再装 @capacitor/status-bar）。
     *
     * style 默认是 DEFAULT，也就是**跟着系统深浅模式走**：系统是浅色就给深色图标。
     * 我们的应用默认是深空主题，系统浅色时就成了"浅灰条 + 深图标"，跟应用完全不搭。
     * 这里钉死 dark（深色背景 + 浅色图标）。
     *
     * initialViewportFitValueHint 是提前告诉它 index.html 里已经有 viewport-fit=cover，
     * 这样它一上来就让 WebView 铺到状态栏下面（省掉一次重新排版的跳动），
     * 再由页面里的 env(safe-area-inset-*) 把内容让开。
     */
    SystemBars: {
      style: 'dark',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
