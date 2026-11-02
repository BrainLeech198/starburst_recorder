/** 页内栏目切换：日记页、回收站页、全部记录页共用 */
import type { ReactNode } from 'react'

export default function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  /** 可以是纯文字，也可以在后面挂一个计数 */
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'whitespace-nowrap border-b-2 border-brand px-2 py-1 text-sm text-brand'
          : 'whitespace-nowrap border-b-2 border-transparent px-2 py-1 text-sm text-muted transition-colors hover:text-fg'
      }
    >
      {children}
    </button>
  )
}
