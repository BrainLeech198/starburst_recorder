/**
 * 图片导入里的全屏看图灯箱。
 *
 * 黑底铺满，滚轮 / 双指缩放、拖动平移，底部可上一张 / 下一张，不改页序。
 * 只负责看，不改任何识别结果；退出后仍然停在原来的缩略图列表。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { useBackdropClose } from '@/shared/ui/useBackdropClose'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const STEP = 0.5

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  /** 只取预览图和页序；状态不影响看大图 */
  images: { preview: string }[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const backdrop = useBackdropClose(onClose)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  const total = images.length
  const image = images[index]

  /** 把画布移动限制在大图边缘以内，别一拖就找不回来 */
  const clampOffset = useCallback((x: number, y: number, scale: number) => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img) return { x, y }
    const maxX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2)
    const maxY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2)
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
  }, [])

  const applyZoom = useCallback(
    (next: number) => {
      const scale = clamp(next, MIN_ZOOM, MAX_ZOOM)
      setZoom(scale)
      setOffset((current) =>
        scale === 1 ? { x: 0, y: 0 } : clampOffset(current.x, current.y, scale),
      )
    },
    [clampOffset],
  )

  // 换一张就回到原始大小，别让上一张的缩放带过去
  const goPrev = useCallback(() => {
    if (index <= 0) return
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    onIndexChange(index - 1)
  }, [index, onIndexChange])

  const goNext = useCallback(() => {
    if (index >= total - 1) return
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    onIndexChange(index + 1)
  }, [index, total, onIndexChange])

  // 左右切换、加减缩放；Esc 由外层 Modal 关掉这一层
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goPrev()
      else if (event.key === 'ArrowRight') goNext()
      else if (event.key === '+' || event.key === '=') applyZoom(zoom + STEP)
      else if (event.key === '-') applyZoom(zoom - STEP)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyZoom, goNext, goPrev, zoom])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size === 2) {
      drag.current = null
      const [a, b] = Array.from(pointers.current.values())
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      }
      return
    }
    if (pointers.current.size === 1 && zoom > 1) {
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      }
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values()).slice(0, 2)
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const base = pinch.current
      if (base && base.distance > 0) applyZoom((base.zoom * distance) / base.distance)
      return
    }

    const start = drag.current
    if (!start) return
    setOffset(
      clampOffset(
        start.offsetX + event.clientX - start.x,
        start.offsetY + event.clientY - start.y,
        zoom,
      ),
    )
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) drag.current = null
  }

  if (!image) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('imageImport.view')}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
      {...backdrop}
    >
      <div
        className="flex items-center justify-between px-4 py-3 text-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="tabular-nums text-white/80">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label={t('imageImport.closeView')}
          className="rounded-lg px-2 py-1 text-xl leading-none text-white/80 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 touch-none overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={() => applyZoom(zoom > 1 ? 1 : 2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(event) => {
          if (event.deltaY === 0) return
          applyZoom(zoom + (event.deltaY < 0 ? STEP : -STEP))
        }}
      >
        <img
          ref={imgRef}
          src={image.preview}
          alt=""
          draggable={false}
          className="absolute top-1/2 left-1/2 max-h-full max-w-full origin-center object-contain select-none"
          style={{
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>

      <div
        className="flex flex-wrap items-center justify-center gap-2 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-white/40 disabled:opacity-30"
        >
          {t('imageImport.prevPage')}
        </button>
        <button
          type="button"
          onClick={() => applyZoom(zoom - STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label={t('imageImport.zoomOut')}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-white/40 disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1)}
          disabled={zoom === 1}
          aria-label={t('imageImport.zoomReset')}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs tabular-nums text-white/85 transition-colors hover:border-white/40 disabled:opacity-30"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => applyZoom(zoom + STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label={t('imageImport.zoomIn')}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-white/40 disabled:opacity-30"
        >
          +
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={index === total - 1}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/85 transition-colors hover:border-white/40 disabled:opacity-30"
        >
          {t('imageImport.nextPage')}
        </button>
      </div>
      <p className="pb-3 text-center text-[11px] text-white/50">
        {t('imageImport.viewerHint')}
      </p>
    </div>
  )
}
