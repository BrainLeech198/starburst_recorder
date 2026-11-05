/**
 * 收支票据的缩略图：只是列表里的小参考图，不是给模型看的输入。
 *
 * 口径和食物照片一致：居中裁成 1:1、长边最多 512px、优先 WebP；
 * 单张控制在几十 KB，跟着整库备份走也不会把备份撑大。
 */
import { translate } from '@/shared/i18n/context'
import { loadImage } from '@/features/ai/aiVision'
import {
  readOriginalImage,
  resolveImageQuality,
  type ImageQuality,
} from '@/shared/media/imageQuality'

export const FINANCE_PHOTO_MAX_EDGE = 512
const WEBP_QUALITY = 0.75
const JPEG_QUALITY = 0.72

function releaseImage(image: HTMLImageElement) {
  image.removeAttribute('src')
  image.src = ''
}

/**
 * 存库用的票据照片：默认压缩并裁成正方形。
 * 设置里给经济选了「原图」时，这里原样返回文件，不再裁剪压缩。
 */
export async function compressFinancePhoto(
  file: File,
  quality: ImageQuality = resolveImageQuality('finance'),
): Promise<string> {
  if (quality === 'original') return readOriginalImage(file)

  const image = await loadImage(file)
  try {
    const side = Math.min(image.width, image.height)
    if (side <= 0) throw new Error(translate('finance.photoFailed'))

    const target = Math.min(FINANCE_PHOTO_MAX_EDGE, side)
    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(translate('finance.photoFailed'))

    ctx.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    )
    releaseImage(image)

    const webp = canvas.toDataURL('image/webp', WEBP_QUALITY)
    const result = webp.startsWith('data:image/webp')
      ? webp
      : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    canvas.width = 0
    canvas.height = 0
    return result
  } finally {
    releaseImage(image)
  }
}
