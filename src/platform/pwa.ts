/**
 * 网页版（PWA）相关的平台判断与注册。
 *
 * 这个项目现在有三个宿主：Electron 桌面壳、Capacitor 安卓壳、纯网页。
 * 前两个有自己的壳层能力，只有「纯网页」需要 Service Worker 与存储持久化，
 * 所以这里先给出一个明确的判据，别在调用点各自写一遍 UA 判断。
 */
import { Capacitor } from '@capacitor/core'
import { desktopBridge } from './desktop'

/**
 * 纯网页：既不是桌面壳，也不是 Capacitor 原生壳。
 * 注意不能只看 UA——安卓手机上的 Chrome 打开网页版时 UA 也是 Android。
 */
export function isWebApp(): boolean {
  if (desktopBridge()) return false
  return !Capacitor.isNativePlatform()
}

/** 是否以「已添加到主屏幕」的独立窗口运行（iOS 只有装到主屏幕才会有推送与独立窗口） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari 不实现 display-mode，只给这个私有字段
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * iPhone / iPad 上的网页版（不含桌面壳、安卓壳、安卓网页版）。
 *
 * 两个地方要用它，而且判据必须是同一个：
 * - 导出时走系统分享面板（`saveFile.ts`）——iOS 上 `<a download>` 用户找不到；
 * - 首次进首页提示「添加到主屏幕」——只有 Safari 需要手动装。
 * iPadOS 13+ 的 UA 报的是 Macintosh，只能靠触点数把它和真的 Mac 区分开。
 */
export function isIosWebApp(): boolean {
  if (!isWebApp()) return false
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * 注册 Service Worker。
 *
 * 只在生产构建里注册：开发时它会把 Vite 的热更新模块也缓存下来，
 * 改一行代码刷新没反应，排查起来很费时间。
 *
 * 故意**不做**「新版本就立刻 skipWaiting」：那会在用户正在写日记时把页面换成新的 JS。
 * 这里让它等——所有页面都关掉之后浏览器才激活新版本，下次打开自然是最新的。
 * 又因为 HTML 走的是网络优先，其实下一次打开就已经是新版本了，等待期只在极端情况下才被感知。
 */
export function registerServiceWorker(): void {
  if (!isWebApp()) return
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const start = () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // 应用被切回前台时顺便查一次，比等浏览器自己按 24 小时轮询要快
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update()
        })
      })
      .catch(() => {
        // 不支持、被隐私设置禁用、非安全上下文：都当作没有离线能力，页面照常用
      })
  }

  // 等首屏渲染完再注册，别和首屏抢带宽
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

/**
 * 请求「持久存储」，降低浏览器在磁盘吃紧时把 IndexedDB 清掉的概率。
 *
 * iOS Safari 对这个 API 支持有限，返回值不能当作保证——真正的兜底还是导出备份。
 * 之所以仍然要请求：桌面 Chrome / Edge 上它会直接把存储标记为 persistent，
 * 那是实打实的保护，成本只有一次调用。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
