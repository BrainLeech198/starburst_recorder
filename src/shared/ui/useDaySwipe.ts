/**
 * 整页左右滑动换天：左滑下一天、右滑前一天。
 *
 * 挂在页面根节点上，只认单指、横向位移足够且明显大于纵向位移的手势；
 * 输入框、文本域、可横向滚动的控件里起手的一律忽略，避免抢走打字和拖选。
 */
import { useRef } from 'react'
import type { TouchEvent } from 'react'

/** 这些元素里的左右滑动属于原有交互（光标、选区、滑块），不当作换天 */
const IGNORE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-no-day-swipe]'

const MIN_DISTANCE = 60
const MAX_DURATION = 1000

export function useDaySwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null)

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    start.current = null
    if (event.touches.length !== 1) return

    const target = event.target as HTMLElement | null
    if (target?.closest(IGNORE_SELECTOR)) return

    // 从手指所在节点向上找，遇到可横向滚动的内容就放过这次手势
    for (let node = target; node && node !== event.currentTarget; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 4) return
    }

    const touch = event.touches[0]
    start.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const origin = start.current
    start.current = null
    if (!origin) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - origin.x
    const dy = touch.clientY - origin.y
    if (Math.abs(dx) < MIN_DISTANCE) return
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (Date.now() - origin.time > MAX_DURATION) return

    if (dx < 0) onNext()
    else onPrev()
  }

  return { onTouchStart, onTouchEnd }
}
