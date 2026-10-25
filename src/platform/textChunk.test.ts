import { describe, expect, it } from 'vitest'
import { chunkToBase64, SAVE_CHUNK_BYTES } from './textChunk'

function decode(piece: string): Uint8Array {
  const binary = atob(piece)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

describe('备份分块编码', () => {
  it('拼回原样：中文、emoji、纯 ASCII 都不能坏', () => {
    const text = '今天吃了一碗牛肉面🍜，还写了三行日记。'
    const bytes = new TextEncoder().encode(text)
    const pieces = chunkToBase64(bytes, 8)
    const joined = new Uint8Array(pieces.flatMap((piece) => Array.from(decode(piece))))
    expect(new TextDecoder().decode(joined)).toBe(text)
    expect(pieces.length).toBeGreaterThan(1)
  })

  it('最后一块可以比 size 小，空内容不产块', () => {
    expect(chunkToBase64(new Uint8Array(20), 8).map((p) => decode(p).length)).toEqual([8, 8, 4])
    expect(chunkToBase64(new Uint8Array(0))).toEqual([])
  })

  it('恰好整除时不多产一块', () => {
    expect(chunkToBase64(new Uint8Array(16), 8)).toHaveLength(2)
  })

  it('默认块大小是 128 KB，够大不至于几千次调用', () => {
    expect(SAVE_CHUNK_BYTES).toBe(128 * 1024)
  })

  it('size 非法直接报错，不要静默产出坏备份', () => {
    expect(() => chunkToBase64(new Uint8Array(1), 0)).toThrow(RangeError)
    expect(() => chunkToBase64(new Uint8Array(1), -1)).toThrow(RangeError)
  })
})
