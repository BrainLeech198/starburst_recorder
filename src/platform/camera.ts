/**
 * 拍照能力的平台判断。
 *
 * 拍照用 `<input type="file" accept="image/*" capture="environment">` 唤起系统相机，
 * 不装 @capacitor/camera——两者拿到的都是一张图片 File，少一个依赖少一份权限配置。
 *
 * 只在安卓给入口：桌面摄像头拍日记本不是正常用法，浏览器里也没必要。
 */
import { Capacitor } from '@capacitor/core'

export function canUseCamera(): boolean {
  return Capacitor.getPlatform() === 'android'
}
