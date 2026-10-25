/**
 * 拍照能力的平台判断与实现。
 *
 * 安卓 WebView 的 `<input type="file" capture>` 不可靠：Capacitor 只给系统一个「选文件」的
 * intent，capture 属性会被忽略，结果是打开了相册而不是相机。所以原生端改用
 * @capacitor/camera 直接调系统相机；手机浏览器仍然走 input capture。
 *
 * 桌面端不给拍照入口：桌面摄像头拍日记本不是正常用法。
 */
import { Capacitor } from '@capacitor/core'

/** 有「拍照」入口的平台：安卓原生，或手机浏览器（input capture 在手机上能开相机） */
export function canUseCamera(): boolean {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'android'
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** 原生端要靠插件拍照，浏览器端仍用带 capture 的 input */
export function usesNativeCamera(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** 调系统相机拍一张，返回能直接进识别的 File；用户取消或没权限时返回 null */
export async function takeNativePhoto(): Promise<File | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      // 成分表要看得清小字，宽度给足
      width: 2000,
      correctOrientation: true,
    })
    if (!photo.webPath) return null
    const blob = await (await fetch(photo.webPath)).blob()
    const ext = photo.format || 'jpeg'
    return new File([blob], `photo-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    })
  } catch {
    // 用户取消、没授权、设备没有相机：都当作没拍
    return null
  }
}
