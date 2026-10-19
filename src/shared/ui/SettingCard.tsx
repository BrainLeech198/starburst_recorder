/**
 * 设置页每一块的外壳：卡片 + 标题 + 一句说明 + 右上角「当前值」。
 *
 * 抽出来是为了让设置页里各段长得一样——之前各段是平铺在页面上的，
 * 内容一多就显得散装，也看不出当前到底是什么状态。
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

/** 卡片里的一个分组：上面一条分隔线 + 小标题 */
export function SettingGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
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
  title: string
  description?: string
  /** 右上角显示当前值，通常传一个 <SettingBadge> */
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-fg">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted">{description}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}
