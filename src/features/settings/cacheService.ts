/**
 * 清理临时缓存：网页/界面的 HTTP 缓存，以及更新时下载的安装包。
 *
 * 真实记录（日记、随记、健康、收支）和 AI 配置都不在这里动。桌面和安卓各自的
 * 缓存位置不同，所以走平台通道；浏览器没法直接清 HTTP 缓存，只能清 Cache Storage。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { desktopBridge } from '@/platform/desktop'

export interface CacheClearResult {
  /** 释放掉的安装包/缓存目录字节数；HTTP 缓存不计入，可能为 0 */
  bytes: number
}

/** 小于 1 MB 用 KB，再往上保留一位小数 */
export function formatCacheSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface NativeCachePlugin {
  clear: () => Promise<{ bytes?: number }>
}

const NativeCache = registerPlugin<NativeCachePlugin>('Cache')

function androidNative(): NativeCachePlugin | undefined {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    ? NativeCache
    : undefined
}

export async function clearAppCache(): Promise<CacheClearResult> {
  const desktop = desktopBridge()
  if (desktop?.cache) return desktop.cache.clear()

  const native = androidNative()
  if (native) {
    const result = await native.clear()
    return { bytes: result.bytes ?? 0 }
  }

  // 浏览器没有清 HTTP 缓存的接口；当前也没有 Service Worker，这里通常本来就是空的
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  return { bytes: 0 }
}
