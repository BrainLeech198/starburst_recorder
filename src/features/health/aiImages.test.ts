import { describe, expect, it } from 'vitest'
import {
  MAX_REFERENCE_IMAGES,
  addReferenceImage,
  referenceImageParts,
  removeReferenceImage,
} from './aiImages'

describe('health aiImages', () => {
  it('追加图片时去重，最多保留三张', () => {
    let images: string[] = []
    for (const image of ['a', 'b', 'a', 'c', 'd']) images = addReferenceImage(images, image)
    expect(images).toEqual(['a', 'b', 'c'])
    expect(images).toHaveLength(MAX_REFERENCE_IMAGES)
    expect(addReferenceImage(images, 'e')).toBe(images)
    expect(addReferenceImage(images, 'a')).toBe(images)
  })

  it('按位置移除，不误删同名图', () => {
    expect(removeReferenceImage(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
    expect(removeReferenceImage(['a'], 5)).toEqual(['a'])
  })

  it('转成图片 content parts，空值不会混进去', () => {
    expect(referenceImageParts(['a', '', 'b'])).toEqual([
      { type: 'image_url', image_url: { url: 'a' } },
      { type: 'image_url', image_url: { url: 'b' } },
    ])
  })
})
