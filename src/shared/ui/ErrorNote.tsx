/**
 * 一处错误提示的统一写法。
 *
 * 之前有裸红字、圆角描边、无字号三种写法，同一件事在不同页长得不一样；
 * 收到一处：淡红底 + 描边 + 一个 ⚠，跟正文拉开层次又不至于吓人。
 */
import type { ReactNode } from 'react'

export default function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mt-2 flex items-start gap-1.5 rounded-lg border border-danger/35 bg-danger/10 px-2.5 py-2 text-xs leading-relaxed text-danger">
      <span aria-hidden="true" className="shrink-0 leading-relaxed">
        ⚠
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}
