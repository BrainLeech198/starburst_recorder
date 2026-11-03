import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAttachment } from './assistantAttachments'

const JPEG_DATA_URL = 'data:image/jpeg;base64,compressed-image'

function stubImagePipeline(originalDataUrl: string) {
  class MockFileReader {
    result: string | ArrayBuffer | null = null
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null

    readAsDataURL() {
      this.result = originalDataUrl
      this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>)
    }
  }

  class MockImage {
    width = 600
    height = 400
    onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null
    onerror: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null

    set src(_value: string) {
      this.onload?.call(this as unknown as GlobalEventHandlers, new Event('load'))
    }
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() })),
    toDataURL: vi.fn(() => JPEG_DATA_URL),
  }
  vi.stubGlobal('FileReader', MockFileReader)
  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  return canvas
}

afterEach(() => vi.unstubAllGlobals())

describe('助手图片附件格式', () => {
  it('把小 PNG 转成 JPEG 后再进入消息附件', async () => {
    const canvas = stubImagePipeline('data:image/png;base64,small-image')
    const attachment = await readAttachment({ name: 'photo.png', type: 'image/png' } as File)

    expect(attachment.dataUrl).toBe(JPEG_DATA_URL)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.75)
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(400)
  })

  it('保留尺寸合规的小 JPEG，避免二次压缩', async () => {
    const canvas = stubImagePipeline(JPEG_DATA_URL)
    const attachment = await readAttachment({ name: 'photo.jpg', type: 'image/jpeg' } as File)

    expect(attachment.dataUrl).toBe(JPEG_DATA_URL)
    expect(canvas.toDataURL).not.toHaveBeenCalled()
  })
})
