import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/shared/i18n/context'
import { photoDownloadName } from '@/shared/media/photoDownload'
import { Icon } from './icons'
import { useOverlayEntry } from './useOverlayEntry'
import { useBackdropClose } from './useBackdropClose'

export default function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const backdrop = useBackdropClose(onClose)
  useOverlayEntry(onClose)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')).filter(
        (item) => item.getClientRects().length > 0,
      )
    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        event.stopImmediatePropagation()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault()
        first.focus()
      }
      event.stopImmediatePropagation()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return createPortal(
    <div
      role="dialog"
      ref={rootRef}
      aria-modal="true"
      aria-label={alt || t('photo.viewerTitle')}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
      {...backdrop}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm text-white/80">
          {alt || t('photo.viewerTitle')}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={src}
            download={photoDownloadName(src, alt)}
            className="inline-flex items-center rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/90 transition-colors hover:border-white/40 hover:text-white"
          >
            <Icon name="download" />
            {t('photo.download')}
          </a>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={t('imageImport.closeView')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
        />
      </div>
    </div>,
    document.body,
  )
}
