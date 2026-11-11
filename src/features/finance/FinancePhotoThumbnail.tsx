import { useEffect, useRef, useState } from 'react'
import financePlaceholder from '@/assets/placeholders/finance.jpg'
import PhotoPreview from '@/shared/ui/PhotoPreview'
import { financePhoto } from './financeRepo'

/** Load a receipt image only when its row approaches the visible area. */
export default function FinancePhotoThumbnail({
  id,
  hasPhoto,
  refreshKey,
}: {
  id: string
  hasPhoto: boolean
  refreshKey: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [nearViewport, setNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const [loadedPhoto, setLoadedPhoto] = useState<{
    key: string
    src: string | null
  } | null>(null)
  const photoKey = `${id}:${refreshKey}`

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
  }, [hasPhoto, id])

  useEffect(() => {
    let alive = true
    if (!hasPhoto || !nearViewport) {
      void Promise.resolve().then(() => {
        if (alive) setLoadedPhoto(null)
      })
      return () => {
        alive = false
      }
    }
    void financePhoto(id).then((next) => {
      if (alive) setLoadedPhoto({ key: photoKey, src: next })
    }).catch(() => {
      if (alive) setLoadedPhoto({ key: photoKey, src: null })
    })
    return () => {
      alive = false
    }
  }, [id, hasPhoto, nearViewport, photoKey])

  const photoResolved = loadedPhoto?.key === photoKey
  const photo = loadedPhoto?.key === photoKey ? loadedPhoto.src : null

  if (!hasPhoto || (photoResolved && !photo)) {
    return (
      <span aria-hidden="true" className="shrink-0">
        <img
          src={financePlaceholder}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-11 w-11 rounded-lg border border-line/60 object-cover"
        />
      </span>
    )
  }
  if (!photo) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className="h-11 w-11 shrink-0 rounded-lg border border-line/60 bg-surface-2"
      />
    )
  }
  return (
    <span ref={ref} className="shrink-0">
      <PhotoPreview
        src={photo}
        alt=""
        wrapperClassName="shrink-0"
        className="h-11 w-11 rounded-lg border border-line/60"
      />
    </span>
  )
}
