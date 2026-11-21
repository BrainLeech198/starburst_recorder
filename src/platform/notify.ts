/**
 * 弹一条系统通知——各平台各走各的路。
 *
 * - **桌面（Electron）**：`new Notification()` 直接可用，渲染进程原生支持。
 * - **浏览器 / PWA**：必须走 Service Worker 的 `showNotification`。
 *   iOS 16.4+ 虽然定义了 `Notification` 对象，但构造函数是空的，`new Notification()`
 *   会抛 `TypeError`；安卓 Chrome 在部分版本上也只在 SW 里才弹得出来。
 * - **安卓原生壳**：不走这里。那边由 `@capacitor/local-notifications` 预排，
 *   应用没开着也会弹，见各 feature 的 `syncXxxReminder`。
 *
 * 全流程吞异常：通知被系统关掉、隐私模式、iOS 上的限制，都不该让页面里的功能跟着挂。
 * 页面内的横幅与列表本来就在，通知只是补充。
 */
import { desktopBridge } from './desktop'

const ICON = './icons/icon-192.png'

/** 只在用户手势中调用：后台到点检查不能可靠弹出浏览器权限询问。 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (desktopBridge()?.isDesktop === true) return true
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** 权限可由调用方要求申请；日程提醒会在表单用户手势中提前申请。 */
export async function notifyNow(
  title: string,
  body: string,
  options: { requestPermission?: boolean } = {},
): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false
    const desktop = desktopBridge()?.isDesktop === true
    if (!desktop && Notification.permission === 'default' && options.requestPermission !== false) {
      if ((await Notification.requestPermission()) !== 'granted') return false
    }
    if (!desktop && Notification.permission !== 'granted') return false
    await deliver(title, body)
    return true
  } catch {
    // 见文件头：通知不可用不算错误
    return false
  }
}

async function deliver(title: string, body: string): Promise<void> {
  if (desktopBridge()?.isDesktop !== true && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: ICON,
        badge: ICON,
        // 同一个 tag：新的一条覆盖旧的，不在通知中心堆成一列
        tag: 'starburst',
      })
      return
    }
  }
  new Notification(title, { body })
}
