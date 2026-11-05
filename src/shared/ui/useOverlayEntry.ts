/**
 * 把自己登记成"一层覆盖层"，好让安卓返回键能先关掉最上面那个。
 *
 * 关掉自己的方式用 ref 兜住，这样登记只做一次（每次渲染都重新登记的话，
 * 层叠顺序会乱，而且调用方传的大多是箭头函数、每次都换身份）。
 */
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { popOverlay, pushOverlay } from './overlayStack'
import type { OverlayEntry } from './overlayStack'

export function useOverlayEntry(
  close: (() => void) | null,
): MutableRefObject<OverlayEntry | null> {
  const latest = useRef(close)
  const entryRef = useRef<OverlayEntry | null>(null)
  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    const entry = pushOverlay(latest.current ? () => latest.current?.() : null)
    entryRef.current = entry
    return () => {
      popOverlay(entry)
      if (entryRef.current === entry) entryRef.current = null
    }
  }, [])
  return entryRef
}
