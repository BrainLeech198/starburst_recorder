/**
 * 列表里的照片缩略图。
 *
 * 高度固定、宽度跟着原图比例走，超出上限就整体缩进去（object-contain），
 * 所以横图、竖图、长截图都不会被裁成正方形；不用正方形裁切是因为
 * 食物、票据、随记这些照片本来就长宽各异，裁掉边角反而看不出是什么。
 */
import type { CSSProperties } from 'react'

export type ThumbSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'attach' | 'form'

const SIZE: Record<ThumbSize, string> = {
  xs: 'h-8 max-w-16',
  sm: 'h-10 max-w-20',
  md: 'h-11 max-w-24',
  lg: 'h-14 max-w-32',
  xl: 'h-20 max-w-40',
  attach: 'h-12 max-w-24',
  form: 'h-16 max-w-32',
}

export default function PhotoThumb({
  src,
  alt = '',
  size = 'md',
  rounded = 'rounded-lg',
  className = '',
  style,
}: {
  src: string
  alt?: string
  size?: ThumbSize
  rounded?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${SIZE[size]} w-auto shrink-0 border border-line/60 bg-surface-2 object-contain ${rounded} ${className}`}
      style={style}
    />
  )
}
