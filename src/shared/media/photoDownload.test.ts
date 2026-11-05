import { describe, expect, it } from 'vitest'
import { photoDownloadName } from './photoDownload'

describe('photoDownloadName', () => {
  it('keeps the saved image format and a readable record name', () => {
    expect(photoDownloadName('data:image/webp;base64,AAAA', '早餐')).toBe('早餐.webp')
    expect(photoDownloadName('data:image/jpeg;base64,AAAA', 'receipt.jpg')).toBe('receipt.jpg')
  })

  it('uses the selected file extension for blob previews', () => {
    expect(photoDownloadName('blob:http://localhost/image-id', 'meal-photo.jpeg')).toBe(
      'meal-photo.jpeg',
    )
  })

  it('replaces filename characters that are not portable', () => {
    expect(photoDownloadName('data:image/png;base64,AAAA', '2026/11:photo')).toBe(
      '2026_11_photo.png',
    )
  })
})
