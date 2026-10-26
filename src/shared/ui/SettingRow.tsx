/**
 * 设置页一级菜单的一行：emoji + 名称 + 右侧「当前值」+ ›
 *
 * 二级内容各自成页（见 PageShell），一级只回答两件事：
 * 「点它去哪儿」和「现在是什么状态」。右侧的当前值沿用 SettingBadge，
 * 这样"一眼读到当前值"的约定在两级结构里都成立。
 * 不需要进二级页、点一下就当场执行的行（比如清理缓存）传 onClick。
 */
import { Link } from 'react-router'
import type { ReactNode } from 'react'

export default function SettingRow({
  to,
  onClick,
  emoji,
  title,
  hint,
  value,
}: {
  to?: string
  onClick?: () => void
  emoji: string
  title: string
  /** 名称下面那行小字，写"这一页里有什么" */
  hint?: string
  /** 右侧当前值，通常传一个 <SettingBadge> */
  value?: ReactNode
}) {
  const body = (
    <>
      <span aria-hidden="true" className="text-lg leading-none">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      {value}
      <span aria-hidden="true" className="text-muted">
        ›
      </span>
    </>
  )
  const className =
    'flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-brand'

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}
