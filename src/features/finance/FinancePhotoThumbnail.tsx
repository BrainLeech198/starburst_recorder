import { useEffect, useRef, useState } from 'react'
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
  }, [hasPhoto, id])

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
    void financePhoto(id).then((next) => {
      if (alive) setPhoto(next)
    }).catch(() => {
      if (alive) setPhoto(null)
    })
    return () => {
      alive = false
    }
  }, [id, hasPhoto, nearViewport, refreshKey])

  if (!hasPhoto) return null
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
