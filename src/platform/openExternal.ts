/**
 * 用系统浏览器打开一个链接。
 *
 * 桌面走主进程的 shell.openExternal（不抢占应用窗口），
 * 安卓走原生插件里的 Intent，浏览器里就是普通开新标签。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { desktopBridge } from './desktop'

interface NativeShell {
  openUrl: (options: { url: string }) => Promise<void>
}

const NativeShellPlugin = registerPlugin<NativeShell>('Update')

export async function openExternal(url: string) {
  const desktop = desktopBridge()
  if (desktop?.openExternal) {
    await desktop.openExternal(url)
    return
  }
  if (Capacitor.isNativePlatform()) {
    await NativeShellPlugin.openUrl({ url })
    return
  }
  window.open(url, '_blank', 'noopener')
}
