/**
 * 把一段字节切成若干块 base64。
 *
 * 单独成文件是为了能单测：分块边界错了会写出损坏的备份，
 * 而备份是唯一能救回数据的东西——这种错不能靠肉眼验收。
 */

/** 单块原始字节数。128 KB 一次：桥上一份 base64 约 170 KB，低端机也稳 */
export const SAVE_CHUNK_BYTES = 128 * 1024

/** 字节 → base64。中文要先按 UTF-8 编码再转，调用方负责编码 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // 分块拼接，避免一次展开太多参数把调用栈撑爆
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

/** 切块：最后一块可以小于 size；空内容返回空数组 */
export function chunkToBase64(bytes: Uint8Array, size: number = SAVE_CHUNK_BYTES): string[] {
  if (size <= 0) throw new RangeError('size 必须是正数')
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += size) {
    out.push(bytesToBase64(bytes.subarray(i, i + size)))
  }
  return out
}
