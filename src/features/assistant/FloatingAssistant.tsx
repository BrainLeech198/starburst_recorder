import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { MASCOT_SIZE_PX, useBall } from '@/app/providers/BallProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useI18n } from '@/shared/i18n/context'
import { useScrollLock } from '@/shared/ui/useScrollLock'
import { useOverlayEntry } from '@/shared/ui/useOverlayEntry'
import { useBackdropClose } from '@/shared/ui/useBackdropClose'
import { Mascot } from './Mascot'
import AssistantChat from './AssistantChat'

const POS_KEY = 'starburst.ball.pos'
const EDGE = 8
const DRAG_THRESHOLD = 5
/** 贴边时至少留出 44px，手指仍有足够的可点区域。 */
const PEEK_VISIBLE_PX = 44
/** 多久没有交互后，吉祥物自动贴到最近的边、只露半边 */
const PEEK_DELAY_MS = 30_000
/** 面板里能接键盘焦点的元素：Tab 只在面板里转，别跑到背后页面去 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

/** 默认停在右下角，手机上留出底部切换栏的高度 */
function defaultPos(size: number): Point {
  const bottomGap = window.innerWidth < 768 ? 96 : 28
  return { x: window.innerWidth - size - 20, y: window.innerHeight - size - bottomGap }
}

function clampToViewport(point: Point, size: number): Point {
  return {
    x: clamp(point.x, EDGE, window.innerWidth - size - EDGE),
    y: clamp(point.y, EDGE, window.innerHeight - size - EDGE),
  }
}

/** 贴到最近的一条边，至少露出 44px */
function peekTarget(point: Point, size: number): Point {
  const width = window.innerWidth
  const height = window.innerHeight
  const visible = Math.min(size, PEEK_VISIBLE_PX)
  const gaps = [
    { edge: 'left', value: point.x },
    { edge: 'right', value: width - (point.x + size) },
    { edge: 'top', value: point.y },
    { edge: 'bottom', value: height - (point.y + size) },
  ] as const
  const nearest = gaps.reduce((a, b) => (b.value < a.value ? b : a))

  if (nearest.edge === 'left') return { x: visible - size, y: point.y }
  if (nearest.edge === 'right') return { x: width - visible, y: point.y }
  if (nearest.edge === 'top') return { x: point.x, y: visible - size }
  return { x: point.x, y: height - visible }
}

export default function FloatingAssistant() {
  const { t } = useI18n()
  const { prefs } = useBall()
  const { accent } = useTheme()
  const size = MASCOT_SIZE_PX[prefs.size]

  const [pos, setPos] = useState<Point>(() => readPos() ?? defaultPos(size))
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [peeking, setPeeking] = useState(() => readPos() === null)
  const [tick, setTick] = useState(0)

  const dragStart = useRef<Point | null>(null)
  const dragOffset = useRef<Point | null>(null)
  const dragged = useRef(false)

  // 窗口尺寸变化时把球拉回可视区
  useEffect(() => {
    function onResize() {
      setPos((prev) => clampToViewport(prev, size))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [size])

  // 长时间没有交互（且没在悬停、面板没开着）就贴边半藏
  useEffect(() => {
    if (open || hovering) return
    const timer = window.setTimeout(() => setPeeking(true), PEEK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [open, hovering, tick])

  const restPos = clampToViewport(pos, size)
  const shown = peeking ? peekTarget(restPos, size) : restPos

  /** 任何交互都把它叫出来，并重新开始计时 */
  function wake() {
    setPeeking(false)
    setTick((value) => value + 1)
  }

  function handlePointerEnter(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return
    setHovering(true)
  }

  function handlePointerLeave() {
    setHovering(false)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // 半藏时直接打开：球的位置会在唤醒时移动，不能依赖移动后的 click 命中。
    if (peeking) {
      wake()
      setOpen(true)
      return
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { x: event.clientX, y: event.clientY }
    dragOffset.current = { x: event.clientX - shown.x, y: event.clientY - shown.y }
    dragged.current = false
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const offset = dragOffset.current
    const start = dragStart.current
    if (!offset || !start) return

    if (!dragged.current) {
      const moved =
        Math.abs(event.clientX - start.x) > DRAG_THRESHOLD ||
        Math.abs(event.clientY - start.y) > DRAG_THRESHOLD
      if (!moved) return
      dragged.current = true
    }

    setPos({
      x: clamp(event.clientX - offset.x, EDGE, window.innerWidth - size - EDGE),
      y: clamp(event.clientY - offset.y, EDGE, window.innerHeight - size - EDGE),
    })
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOffset.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragOffset.current = null
    dragStart.current = null
    setDragging(false)
    if (dragged.current) {
      localStorage.setItem(POS_KEY, JSON.stringify(shown))
      setTick((value) => value + 1)
    }
  }

  function handlePointerCancel() {
    dragOffset.current = null
    dragStart.current = null
    setDragging(false)
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
      <div
        role="button"
        tabIndex={0}
        aria-label={t('assistant.open')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setOpen(true)
        }}
        className={[
          'fixed z-30 cursor-grab touch-none select-none active:cursor-grabbing',
          dragging ? '' : 'transition-all duration-300 ease-out motion-reduce:transition-none',
        ].join(' ')}
        style={{ left: shown.x, top: shown.y, width: size, height: size }}
      >
        {prefs.image ? (
          <img src={prefs.image} alt="" className="h-full w-full rounded-full border border-line object-cover shadow-lg animate-breathe motion-reduce:animate-none" />
        ) : (
          <Mascot shape={prefs.shape} color={accent} size={size} className="animate-breathe" />
        )}
      </div>

      {open && <AssistantSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function AssistantSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const backdrop = useBackdropClose(onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  useScrollLock()
  // 登记成一层覆盖层：安卓实体返回键先关它，而不是直接退到上一页
  useOverlayEntry(onClose)

  const { pathname } = useLocation()
  const openedAt = useRef(pathname)

  /*
   * 面板里点「记的事 / 技能 / 完整页面」会换页。不关掉的话，底下页面已经变了、
   * 助手面板还盖在上面，看起来像「点了没反应」，也会让人以为背后还能继续操作。
   * 路由一变就把面板收起来。
   */
  useEffect(() => {
    if (pathname !== openedAt.current) onClose()
  }, [pathname, onClose])

  /*
   * 打开时把焦点收进面板，Tab 只在面板里循环——
   * 否则键盘用户会继续在背后的页面上走，等同于「背后还能被交互」。
   */
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (!panel.contains(document.activeElement)) panel.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.getClientRects().length > 0,
      )
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const inside = panel.contains(current)
      if (event.shiftKey) {
        if (!inside || current === first || current === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || current === last || current === panel) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // portal 到 body，理由同 Modal：抽屉不能被内容区的堆叠上下文困住
  return createPortal(
    <>
      {/* 遮罩同时挡触摸手势：在暗区滑动不该把背后的页面带着滚 */}
      <div className="fixed inset-0 z-40 touch-none bg-black/50" {...backdrop} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('assistant.sheetTitle')}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-2xl border-t border-line bg-surface outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="text-sm font-medium">{t('assistant.sheetTitle')}</span>
          <div className="flex items-center gap-3">
            <Link
              to="/assistant"
              onClick={onClose}
              className="text-sm text-muted transition-colors hover:text-brand"
            >
              {t('assistant.fullPage')}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              {t('assistant.close')}
            </button>
          </div>
        </div>

        <AssistantChat compact />
      </div>
    </>,
    document.body,
  )
}
