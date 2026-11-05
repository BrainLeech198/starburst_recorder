/**
 * 「图片怎么存」的唯一读法：一个全体设置，三个模块可以各自覆盖。
 *
 * 为什么分模块：日记照片是给人翻回去看的，健康食物图和收支票据只是列表里的缩略参考图。
 * 用户可能想让日记留原图、票据维持压缩，所以每个模块都能单独选「跟随全体 / 压缩 / 原图」。
 *
 * 键都放在 localStorage；`sb_image_quality` 是历史键，继续当「全体」用，旧用户设置不丢。
 */
import { translate } from '@/shared/i18n/context'

export type ImageQuality = 'compressed' | 'original'

/** 有独立存法设置的模块 */
export type ImageModule = 'diary' | 'health' | 'finance'

/** 模块设置多一档：没单独选过就跟随全体 */
export type ModuleImageQuality = ImageQuality | 'inherit'

/** 全体设置的键（历史键名，别改） */
export const IMAGE_QUALITY_KEY = 'sb_image_quality'

export const IMAGE_MODULE_KEYS: Record<ImageModule, string> = {
  diary: 'sb_image_quality_diary',
  health: 'sb_image_quality_health',
  finance: 'sb_image_quality_finance',
}

/** 所有跟图片存法有关的键，备份白名单直接引用，免得两处各写一份 */
export const IMAGE_QUALITY_KEYS: string[] = [
  IMAGE_QUALITY_KEY,
  ...Object.values(IMAGE_MODULE_KEYS),
]

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    storage()?.setItem(key, value)
  } catch {
    // 隐私模式写不进去就算了，下次还是默认压缩
  }
}

export function loadGlobalImageQuality(): ImageQuality {
  return read(IMAGE_QUALITY_KEY) === 'original' ? 'original' : 'compressed'
}

export function saveGlobalImageQuality(value: ImageQuality) {
  write(IMAGE_QUALITY_KEY, value)
}

export function loadModuleImageQuality(module: ImageModule): ModuleImageQuality {
  const value = read(IMAGE_MODULE_KEYS[module])
  return value === 'compressed' || value === 'original' ? value : 'inherit'
}

export function saveModuleImageQuality(module: ImageModule, value: ModuleImageQuality) {
  // 「跟随全体」就不留键：以后全体再改，这块也跟着变
  if (value === 'inherit') {
    try {
      storage()?.removeItem(IMAGE_MODULE_KEYS[module])
    } catch {
      // 同 write：写不进去就下次再清
    }
    return
  }
  write(IMAGE_MODULE_KEYS[module], value)
}

/** 某模块最终按哪种方式存：单独选过就用它，否则看全体 */
export function resolveImageQuality(module?: ImageModule): ImageQuality {
  if (module) {
    const own = loadModuleImageQuality(module)
    if (own !== 'inherit') return own
  }
  return loadGlobalImageQuality()
}

/** 原图模式：文件原样转 dataURL，不裁不压 */
export function readOriginalImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(translate('diary.err.imageUnsupported')))
    reader.readAsDataURL(file)
  })
}
