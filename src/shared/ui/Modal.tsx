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
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useScrollLock } from './useScrollLock'
import { useOverlayEntry } from './useOverlayEntry'

/** 面板宽度：小提示用 xs，常规用 sm，要写字的（例如 AI 草稿）用 lg */
const WIDTHS = { xs: 'max-w-xs', sm: 'max-w-sm', lg: 'max-w-lg' } as const

export default function Modal({
  size = 'xs',
  onClose,
  panelClassName = '',
  children,
}: {
  size?: keyof typeof WIDTHS
  /** 点遮罩 / 按 Esc 时怎么关；不传就关不掉 */
  onClose?: () => void
  /** 面板上追加的类：限高自滚、特殊排版都写在这儿 */
  panelClassName?: string
  children: ReactNode
}) {
  useScrollLock()
  useOverlayEntry(onClose ?? null)

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
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl border border-line bg-surface p-4 ${WIDTHS[size]} ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
