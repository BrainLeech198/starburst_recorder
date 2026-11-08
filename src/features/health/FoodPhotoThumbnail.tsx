import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import PhotoPreview from '@/shared/ui/PhotoPreview'
import { healthFoodPhoto, healthMealPhoto } from './healthRepo'

/** Load a catalog photo only when its thumbnail approaches the viewport. */
export default function FoodPhotoThumbnail({
  kind,
  id,
  hasPhoto,
  refreshKey,
  className,
  wrapperClassName = '',
  onClick,
}: {
  kind: 'food' | 'meal'
  id: string
  hasPhoto: boolean
  refreshKey?: number
  className: string
  wrapperClassName?: string
  onClick?: () => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLSpanElement>(null)
  const [nearViewport, setNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const [photo, setPhoto] = useState<string | null>(null)

  useEffect(() => {
    if (!hasPhoto || typeof IntersectionObserver === 'undefined') return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => setNearViewport(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '250px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [id, hasPhoto])

  useEffect(() => {
    let alive = true
    if (!nearViewport || !hasPhoto) {
      void Promise.resolve().then(() => {
        if (alive) setPhoto(null)
      })
      return () => {
        alive = false
      }
    }
    const load = kind === 'food' ? healthFoodPhoto(id) : healthMealPhoto(id)
    void load.then((next) => {
      if (alive) setPhoto(next)
    }).catch(() => {
      if (alive) setPhoto(null)
    })
    return () => {
      alive = false
    }
  }, [kind, id, hasPhoto, nearViewport, refreshKey])

  if (!hasPhoto) return null
  if (!photo) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={`${className} shrink-0 rounded-lg border border-line bg-surface-2`}
      />
    )
  }
  if (onClick) {
    return (
      <span ref={ref} className={`inline-flex shrink-0 ${wrapperClassName}`}>
        <button
          type="button"
          onClick={onClick}
          aria-label={t('photo.view')}
          className="overflow-hidden rounded-lg border border-line transition-opacity hover:opacity-80"
        >
          <img src={photo} alt="" loading="lazy" decoding="async" className={`${className} object-contain`} />
        </button>
      </span>
    )
  }
  return (
    <span ref={ref} className={wrapperClassName}>
      <PhotoPreview src={photo} alt="" className={className} wrapperClassName="shrink-0" />
    </span>
  )
}
