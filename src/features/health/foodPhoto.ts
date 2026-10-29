/**
 * 食物库照片：只是列表里的缩略参考图，不是给模型看的一次性输入，
 * 所以别复用 aiVision 那套 1600px / q0.82 的参数。
 *
 * 口径：
 * - 居中裁成 1:1，长边最多 512px（列表 48px、详情 256px，2x 屏足够）
 * - 优先 WebP q0.75；环境不支持 WebP 时回退 JPEG q0.72
 * - 单张约 30–50KB：照片会跟着整库备份走，太大备份会膨胀
 */
import { translate } from '@/shared/i18n/context'
import { loadImage } from '@/features/ai/aiVision'

export const FOOD_PHOTO_MAX_EDGE = 512
const WEBP_QUALITY = 0.75
const JPEG_QUALITY = 0.72

/** 压缩并裁成正方形，返回可直接存库的 data URL */
export async function compressFoodPhoto(file: File): Promise<string> {
  const image = await loadImage(file)
  const side = Math.min(image.width, image.height)
  if (side <= 0) throw new Error(translate('foods.photoFailed'))

  const target = Math.min(FOOD_PHOTO_MAX_EDGE, side)
  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(translate('foods.photoFailed'))

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

  const webp = canvas.toDataURL('image/webp', WEBP_QUALITY)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
