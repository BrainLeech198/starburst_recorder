/** 在指定长边内等比缩小，不裁切，也不把小图放大。 */
export function fitImageSize(width: number, height: number, maxEdge: number) {
  const edge = Math.max(width, height)
  if (width <= 0 || height <= 0 || maxEdge <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxEdge / edge)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
