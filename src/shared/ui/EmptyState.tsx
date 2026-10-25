/**
 * 空状态：全站统一的样子。
 *
 * 之前有的页面居中写一行灰字、有的贴左写一行，看起来像两种产品；
 * 收到一处，都用「一句图标 + 一句说明 + （可选）一个动作」的说法。
 */
import type { ReactNode } from 'react'

export default function EmptyState({
  icon = '📄',
  text,
  action,
}: {
  /** 一句图形符号，帮人一眼认出这是哪类空态 */
  icon?: string
  /** 说明为什么空、下一步能干什么 */
  text: string
  /** 可选的主动作（去新增、去设置…） */
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <span aria-hidden="true" className="text-2xl leading-none opacity-70">
        {icon}
      </span>
      <p className="m-0 max-w-xs text-sm text-muted">{text}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
