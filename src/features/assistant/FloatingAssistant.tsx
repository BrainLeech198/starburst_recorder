import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import { MASCOT_SIZE_PX, useBall } from '../../app/providers/BallProvider'
import { useTheme } from '../../app/providers/ThemeProvider'
import { Mascot } from './Mascot'

const POS_KEY = 'starburst.ball.pos'
const EDGE = 8

interface Point {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function readPos(): Point | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const point = JSON.parse(raw) as Point
    return typeof point.x === 'number' && typeof point.y === 'number' ? point : null
  } catch {
    return null
  }
}

export default function FloatingAssistant() {
  const { prefs } = useBall()
  const { accent } = useTheme()
  const size = MASCOT_SIZE_PX[prefs.size]
  const [pos, setPos] = useState<Point | null>(readPos)
  const [open, setOpen] = useState(false)

  const dragOffset = useRef<Point | null>(null)
  const dragged = useRef(false)
  const posRef = useRef<Point | null>(null)
  posRef.current = pos

  // 首次进入：默认停在右下角，手机上留出底部切换栏的高度
  useEffect(() => {
    if (pos) return
    const bottomGap = window.innerWidth < 768 ? 96 : 28
    setPos({ x: window.innerWidth - size - 20, y: window.innerHeight - size - bottomGap })
  }, [pos, size])

  // 窗口尺寸或球体大小变化时，把球拉回可视区内
  useEffect(() => {
    function onResize() {
      setPos((prev) =>
        prev
          ? {
              x: clamp(prev.x, EDGE, window.innerWidth - size - EDGE),
              y: clamp(prev.y, EDGE, window.innerHeight - size - EDGE),
            }
          : prev,
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [size])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pos) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOffset.current = { x: event.clientX - pos.x, y: event.clientY - pos.y }
    dragged.current = false
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const offset = dragOffset.current
    if (!offset) return
    const next = {
      x: clamp(event.clientX - offset.x, EDGE, window.innerWidth - size - EDGE),
      y: clamp(event.clientY - offset.y, EDGE, window.innerHeight - size - EDGE),
    }
    dragged.current = true
    setPos(next)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOffset.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragOffset.current = null
    if (dragged.current && posRef.current) {
      localStorage.setItem(POS_KEY, JSON.stringify(posRef.current))
    }
  }

  function handleClick() {
    if (dragged.current) {
      dragged.current = false
      return
    }
    setOpen(true)
  }

  return (
    <>
      {pos && (
        <div
          role="button"
          tabIndex={0}
          aria-label="打开 AI 助手"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setOpen(true)
          }}
          className="fixed z-30 cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ left: pos.x, top: pos.y, width: size, height: size }}
        >
          <Mascot
            shape={prefs.shape}
            color={accent}
            size={size}
            className="animate-breathe"
          />
        </div>
      )}

      {open && <AssistantSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function AssistantSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-2xl border-t border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-medium">星芒助手</span>
          <div className="flex items-center gap-3">
            <Link
              to="/assistant"
              onClick={onClose}
              className="text-sm text-muted transition-colors hover:text-brand"
            >
              完整页面
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="text-sm">AI 还没接入。</p>
          <p className="mt-2 text-xs text-muted">
            接上模型之后，你就可以在这里直接问它「最近体重怎么样」「这周钱花哪了」。
          </p>
        </div>

        <div className="border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <input
              disabled
              placeholder="接入模型后可用…"
              className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
            <button type="button" disabled className="rounded-lg px-3 py-1 text-xs text-muted">
              发送
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
