import type { ReactNode } from 'react'
import { useI18n } from '@/shared/i18n/context'

/**
 * 批量多选时贴在底部的悬浮工具条：日记、随记、回收站三处共用。
 * 左边固定报「已选几项」，右边操作按钮由调用方给。
 */
export default function BatchBar({
  count,
  unit,
  children,
}: {
  count: number
  unit: string
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sb-nav-h)_+_1.5rem)] z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="px-2 text-sm text-fg">
          {t('common.selectedCount', { count, unit })}
        </span>
        {children}
      </div>
    </div>
  )
}
