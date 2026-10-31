/**
 * 手绘板：日记 / 随记缺图时随手画一张，画完压成 PNG 走和照片一样的转码流程。
 *
 * 笔迹按「一条条笔画」记着，撤销就是把最后一笔弹掉重画——不用存整张位图快照，
 * 画很多笔也不会把内存吃掉。橡皮是把白底再涂一遍，导出图始终是不透明的白纸，
 * 放进深色页面里不会透出底下的东西。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { choiceTile, GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'

/** 画布内部分辨率：手机上按 CSS 宽度放大好几倍，线条不会糊 */
const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 900
const COLORS = ['#1f2328', '#e5484d', '#3b82f6', '#16a34a', '#f59e0b']
const WIDTHS = [3, 6, 12]

interface Point {
  x: number
  y: number
}

interface Stroke {
  color: string
  width: number
  points: Point[]
}

export default function SketchDialog({
  onDone,
  onCancel,
}: {
  /** 画完交出一张 PNG；调用方负责转码与写回记录 */
  onDone: (file: File) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const [strokeCount, setStrokeCount] = useState(0)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [erasing, setErasing] = useState(false)
  const [saving, setSaving] = useState(false)

  function context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function drawDot(ctx: CanvasRenderingContext2D, point: Point, stroke: Stroke) {
    ctx.beginPath()
    ctx.fillStyle = stroke.color
    ctx.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 整张重画：白底 + 每一笔按点连起来 */
  const repaint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d') ?? null
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 1) {
        drawDot(ctx, stroke.points[0], stroke)
        continue
      }
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    repaint()
  }, [repaint])

  function paintOf(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    }
  }

  function handleDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (saving) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: Stroke = {
      color: erasing ? '#ffffff' : color,
      width,
      points: [paintOf(event)],
    }
    activeRef.current = stroke
    const ctx = context()
    if (ctx) drawDot(ctx, stroke.points[0], stroke)
  }

  function handleMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeRef.current
    if (!stroke) return
    const ctx = context()
    if (!ctx) return
    const point = paintOf(event)
    const previous = stroke.points[stroke.points.length - 1]
    stroke.points.push(point)
    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(previous.x, previous.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  function handleUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeRef.current
    if (!stroke) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activeRef.current = null
    strokesRef.current.push(stroke)
    setStrokeCount(strokesRef.current.length)
  }

  function undo() {
    if (strokesRef.current.length === 0) return
    strokesRef.current.pop()
    setStrokeCount(strokesRef.current.length)
    repaint()
  }

  function clear() {
    if (strokesRef.current.length === 0) return
    strokesRef.current = []
    setStrokeCount(0)
    repaint()
  }

  async function handleDone() {
    const canvas = canvasRef.current
    if (!canvas || strokeCount === 0 || saving) return
    setSaving(true)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/png'),
    )
    if (!blob) {
      setSaving(false)
      return
    }
    onDone(new File([blob], 'sketch.png', { type: 'image/png' }))
  }

  return (
    <Modal size="xl" label={t('sketch.title')} onClose={onCancel}>
      <div className="text-sm font-medium text-fg">{t('sketch.title')}</div>
      <p className="m-0 mt-1 text-xs text-muted">{t('sketch.hint')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!erasing}
          onClick={() => setErasing(false)}
          className={choiceTile(!erasing, 'px-2.5 py-1 text-xs')}
        >
          {t('sketch.pen')}
        </button>
        <button
          type="button"
          aria-pressed={erasing}
          onClick={() => setErasing(true)}
          className={choiceTile(erasing, 'px-2.5 py-1 text-xs')}
        >
          {t('sketch.eraser')}
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {COLORS.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={t('sketch.color')}
            aria-pressed={!erasing && color === value}
            onClick={() => {
              setColor(value)
              setErasing(false)
            }}
            style={{ backgroundColor: value }}
            className={`h-6 w-6 rounded-full border-2 transition ${
              !erasing && color === value ? 'border-brand' : 'border-line'
            }`}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {WIDTHS.map((value, index) => (
          <button
            key={value}
            type="button"
            aria-label={`${t('sketch.brushSize')} ${index + 1}`}
            aria-pressed={width === value}
            onClick={() => setWidth(value)}
            className={choiceTile(width === value, 'flex h-8 w-8 items-center justify-center')}
          >
            <span
              aria-hidden="true"
              style={{ width: value + 3, height: value + 3 }}
              className="rounded-full bg-current"
            />
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={strokeCount === 0}
            className={GHOST_BUTTON}
          >
            {t('sketch.undo')}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={strokeCount === 0}
            className={GHOST_BUTTON}
          >
            {t('sketch.clear')}
          </button>
        </span>
      </div>

      <div className="mt-3 flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label={t('sketch.title')}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          className="aspect-[4/3] w-full max-w-[min(100%,70vh)] touch-none rounded-xl border border-line bg-white select-none"
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleDone()}
          disabled={strokeCount === 0 || saving}
          className={`${SOLID_BUTTON} disabled:opacity-40`}
        >
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
