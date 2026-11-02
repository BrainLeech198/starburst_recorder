/**
 * 全站统一的「返回上一页」按钮。
 *
 * 用 button 不用 Link：这是动作，不是目的地——去哪儿要等点了才知道（见 `backNav.ts`）。
 * 想要固定去处的地方（例如日记编辑页的「回日历」、日历页的「回某月」）仍然用 Link，
 * 别套这个组件，否则会变成「回到上一页」而不是「去那一页」。
 *
 * 样式由调用点传：页头是实心红 BACK_BUTTON，日期栏里是矮一档的 NAV_BACK_BUTTON。
 */
import type { ReactNode } from 'react'
import { useBack } from './backNav'
import { Icon } from './icons'

export default function BackButton({
  to,
  label,
  icon = false,
  className = '',
}: {
  /** 退无可退时去哪：直接打开链接、或冷启动就落在这一页时用 */
  to: string
  label: ReactNode
  /** 是否带一个左箭头（页头的返回带，日期栏里的不带） */
  icon?: boolean
  className?: string
}) {
  const back = useBack(to)
  return (
    <button type="button" onClick={back} className={className}>
      {icon && <Icon name="back" className="h-4 w-4 shrink-0" />}
      {label}
    </button>
  )
}
