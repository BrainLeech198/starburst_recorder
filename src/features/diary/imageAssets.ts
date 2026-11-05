/**
 * 把用户选的照片变成能直接存进记录的 DiaryImage。
 *
 * 两种存法由「数据与备份 → 图片怎么存」控制，日记可以单独覆盖全体设置：
 *   - 压缩（默认）：长边 1600、JPEG 0.82，一张通常一两百 KB；
 *   - 原图：原样转 dataURL，清晰但一张可能几 MB，备份文件会明显变大。
 *
 * 图片直接躺在记录里，所以这里不碰数据库，只负责转码与量尺寸。
 */
import type { DiaryImage } from '@/core/db/schema'
import { compressImage } from '@/features/ai/aiVision'
import { newId } from '@/core/utils/id'
import { translate } from '@/shared/i18n/context'
import { readOriginalImage, resolveImageQuality } from '@/shared/media/imageQuality'
import type { ImageQuality } from '@/shared/media/imageQuality'

export type { ImageQuality }

/** 单条记录最多带几张：和 normalize 里的上限一致 */
export const MAX_IMAGES = 9

/** 读一张图的像素尺寸：存下来，渲染时先占好位，图片加载完页面不跳 */
function sizeOf(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error(translate('diary.err.imageUnsupported')))
    image.src = source
  })
}

/**
 * 一批照片 → 一批 DiaryImage。
 * 非图片文件直接报错；超过上限的部分截掉，由调用方提示。
 */
export async function prepareImages(
  files: File[],
  quality: ImageQuality = resolveImageQuality('diary'),
): Promise<DiaryImage[]> {
  const picked = files.filter((file) => file.type.startsWith('image/')).slice(0, MAX_IMAGES)
  if (picked.length === 0) throw new Error(translate('diary.err.imageUnsupported'))
  return Promise.all(
    picked.map(async (file) => {
      const dataUrl = quality === 'original' ? await readOriginalImage(file) : await compressImage(file)
      const { width, height } = await sizeOf(dataUrl)
      return { id: newId(), dataUrl, width, height }
    }),
  )
}
