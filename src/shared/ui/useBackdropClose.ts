/**
 * 遮罩点击关闭：只有「按在遮罩上、也在遮罩上松开」才算点了遮罩。
 *
 * 只绑 onClick 时，在面板里按住拖选文字、鼠标滑出面板再松开，浏览器会把这次 click
 * 算在两层共同的祖先（遮罩）上，弹窗于是被误关。这里记下按下时落在哪儿来挡掉这种。
 * 弹窗、图片查看器、助手面板共用这一份。
 */
import { useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

export function useBackdropClose(onClose?: () => void) {
  /** 按下时是否落在遮罩本身；null 表示没收到按下事件（例如程序合成的点击） */
  const pressedBackdrop = useRef<boolean | null>(null)

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      pressedBackdrop.current = event.target === event.currentTarget
    },
    onClick(event: MouseEvent<HTMLElement>) {
      // 没收到按下事件时退回旧口径：点在遮罩上就关
      const closed =
        event.target === event.currentTarget &&
        (pressedBackdrop.current === null || pressedBackdrop.current)
      pressedBackdrop.current = null
      if (closed) onClose?.()
    },
  }
}
