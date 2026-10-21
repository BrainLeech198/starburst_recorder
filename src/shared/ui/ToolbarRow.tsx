/**
 * 按钮行：一行里只放功能按钮的地方（返回 / 删除 / 批量 / 清空 / 回收站…）。
 *
 * 它铺一层比内容背景亮半档的底色（bg-surface-2，与卡片同一层），再套圆角与描边，
 * 于是"这一条是动作区、下面那块是内容"一眼能分开——不然一串按钮直接浮在页面底色上，
 * 按钮和内容糊在同一层，既没有结构感也看不出主次。
 *
 * 只给"整行都是按钮"的地方用，页头（PageHeader）也走它：返回行本身也是一条按钮行。
 * 日期、标签页这类混着文字的行别套。
 */
import type { ReactNode } from 'react'

export default function ToolbarRow({
  children,
  className = 'flex items-center justify-between gap-2',
}: {
  children: ReactNode
  /** 追加或覆盖排布方式；默认两端对齐 */
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface-2 p-2 ${className}`}>{children}</div>
  )
}
