/**
 * 弹窗外壳：半透明遮罩 + 居中的面板。
 *
 * 全站 5 个弹窗原来是同一套两层 div 各写一遍（遮罩、点遮罩关闭、面板样式、
 * 打开时锁内容区滚动），这里收成一处，免得改一次样式要动五个文件。
 *
 * 点遮罩和按 Esc 都走 onClose：不给 onClose 就表示这个弹窗不能被这两种方式关掉。
 *
 * 另外它在打开时会把自己登记成"一层覆盖层"（见 useOverlayEntry）：安卓实体返回键
 * 的口径是「先关弹窗，再回上一级」，得靠这份登记簿找到最上面那一层。
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useScrollLock } from './useScrollLock'
import { useOverlayEntry } from './useOverlayEntry'
import { useBackdropClose } from './useBackdropClose'

/** 面板宽度：小提示用 xs，常规用 sm，要写字的（例如 AI 草稿）用 lg，并排对照用 xl */
const WIDTHS = { xs: 'max-w-xs', sm: 'max-w-sm', lg: 'max-w-lg', xl: 'max-w-2xl' } as const

/** 能接键盘焦点的元素：Tab 在弹窗里循环时用 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  size = 'xs',
  label,
  onClose,
  panelClassName = '',
  children,
}: {
  size?: keyof typeof WIDTHS
  /** 给读屏用的弹窗标题；不显示，只看已有的可见标题 */
  label: string
  /** 点遮罩 / 按 Esc 时怎么关；不传就关不掉 */
  onClose?: () => void
  /** 面板上追加的类：限高自滚、特殊排版都写在这儿 */
  panelClassName?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropClose(onClose)
  useScrollLock()
  useOverlayEntry(onClose ?? null)

  // 打开时把焦点收进弹窗，Tab 只在弹窗里转，关闭后还给原来的元素。
  // 否则键盘和读屏用户会继续在背后的页面上走，根本不知道弹出了什么。
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    // 子元素自己 autoFocus 时（例如日期选择器的手填年月）不抢它的焦点
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
      // 焦点在面板本身（刚打开）时，Tab 从第一个开始、Shift+Tab 从最后一个开始
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
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      {...backdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`w-full rounded-2xl border border-line bg-surface p-4 outline-none ${WIDTHS[size]} ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
