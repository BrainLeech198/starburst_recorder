/**
 * 食物库照片：随食物记录保存，不是给模型看的一次性输入，
 * 所以别复用 aiVision 那套 1600px / q0.82 的参数。
 *
 * 口径：
 * - 保留完整原图比例，等比缩小到长边最多 512px（列表 48px、详情 256px，2x 屏足够）
 * - 优先 WebP q0.75；环境不支持 WebP 时回退 JPEG q0.72
 * - 单张约 30–50KB：照片会跟着整库备份走，太大备份会膨胀
 */
import { translate } from '@/shared/i18n/context'
import { loadImage } from '@/features/ai/aiVision'
import {
  readOriginalImage,
  resolveImageQuality,
  type ImageQuality,
} from '@/shared/media/imageQuality'
import { fitImageSize } from '@/shared/media/fitImageSize'

export const FOOD_PHOTO_MAX_EDGE = 512
const WEBP_QUALITY = 0.75
const JPEG_QUALITY = 0.72

/** 断开 Image 的 src，让解码后的原图位图尽快回收 */
function releaseImage(image: HTMLImageElement) {
  image.removeAttribute('src')
  image.src = ''
}

/**
 * 存库用的食物照片：默认压缩并等比缩小，保留完整画面。
 * 设置里给健康选了「原图」时，这里原样返回文件，不再裁剪压缩。
 */
export async function compressFoodPhoto(
  file: File,
  quality: ImageQuality = resolveImageQuality('health'),
): Promise<string> {
  if (quality === 'original') return readOriginalImage(file)

  const image = await loadImage(file)
  try {
    const target = fitImageSize(image.width, image.height, FOOD_PHOTO_MAX_EDGE)
    if (target.width <= 0 || target.height <= 0) throw new Error(translate('foods.photoFailed'))
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(translate('foods.photoFailed'))

    ctx.drawImage(image, 0, 0, target.width, target.height)
    // 手机原图解码后动辄几十 MB；画进小画布后立刻断开，别拖到 GC 才释放，
    // 否则保存写库时叠加一次全库序列化，低内存设备容易被系统杀掉
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
