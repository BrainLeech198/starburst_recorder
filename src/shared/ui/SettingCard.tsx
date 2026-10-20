/**
 * 设置项的外壳：卡片 +（可选）标题 + 一句说明 + 右上角「当前值」。
 *
 * 二级页里往往"一页只剩这一块"，那种情况下不传 title——
 * 页面名与当前值由 PageShell 承担（标题不重复出现两遍）。
 */
import type { ReactNode } from 'react'

/** 右上角的当前值小药丸。tone 只用来区分「通了 / 没通」这类状态 */
export function SettingBadge({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'ok' | 'bad'
}) {
  return (
    <span
      className={[
        'flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
        tone === 'ok'
          ? 'border-brand text-brand'
          : tone === 'bad'
            ? 'border-danger text-danger'
            : 'border-line text-muted',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/** 卡片里的一个分组：上面一条分隔线 + 小标题。卡片里的第一组传 first，省掉那条线 */
export function SettingGroup({
  label,
  children,
  first = false,
}: {
  label: string
  children: ReactNode
  /** 第一组不要上面的分隔线：二级页的卡片常常不带标题，那条线会显得突兀 */
  first?: boolean
}) {
  return (
    <div className={first ? '' : 'mt-4 border-t border-line pt-4'}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

export default function SettingCard({
  title,
  description,
  badge,
  children,
}: {
  /** 二级页里"一页只有这一块"时可以不写：页面名已经在上面了（见 PageShell） */
  title?: string
  description?: string
  /** 右上角显示当前值，通常传一个 <SettingBadge> */
  badge?: ReactNode
  children: ReactNode
}) {
  const hasHeader = Boolean(title || description || badge)
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {hasHeader && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-medium text-fg">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted">{description}</p>}
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}
