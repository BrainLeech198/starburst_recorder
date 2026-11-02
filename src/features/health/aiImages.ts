/**
 * AI 对话里的图片参考：只随这次对话发送，不落库。
 * 食物要估得准，光靠文字不够时，拍过的成分表或实物图可以继续带着聊。
 */
import type { ChatContentPart } from '@/platform/desktop'

/** 一次对话最多带几张参考图 */
export const MAX_REFERENCE_IMAGES = 3

/** 追加一张；重复或已满就原样返回，避免同一张图反复占位置 */
export function addReferenceImage(images: string[], dataUrl: string): string[] {
  if (dataUrl === '' || images.includes(dataUrl) || images.length >= MAX_REFERENCE_IMAGES) {
    return images
  }
  return [...images, dataUrl]
}

export function removeReferenceImage(images: string[], index: number): string[] {
  return images.filter((_, position) => position !== index)
}

/** 图片参考转成 OpenAI 的 content parts */
export function referenceImageParts(images: string[]): ChatContentPart[] {
  return images
    .filter((image) => image !== '')
    .slice(0, MAX_REFERENCE_IMAGES)
    .map((image) => ({ type: 'image_url' as const, image_url: { url: image } }))
}
