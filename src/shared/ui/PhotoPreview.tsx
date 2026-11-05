import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useI18n } from '@/shared/i18n/context'
import PhotoLightbox from './PhotoLightbox'

/** 图片缩略预览：完整显示原图比例，点击后在全屏灯箱查看并下载。 */
export default function PhotoPreview({
  src,
  alt = '',
  className,
  wrapperClassName = '',
  width,
  height,
}: {
  src: string
  alt?: string
  className: string
  wrapperClassName?: string
  width?: number
  height?: number
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={t('photo.view')}
        title={t('photo.view')}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className={`inline-flex max-w-full cursor-zoom-in items-center justify-center ${wrapperClassName}`}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          className={`${className} object-contain`}
        />
      </span>
      {open && <PhotoLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}
