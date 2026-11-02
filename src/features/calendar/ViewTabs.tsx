/**
 * 日历家族的统一视图切换：月 / 周 / 日程 / 回顾。
 *
 * 之前这四个入口散在各页头部、日期栏左右两端，标签和位置都不一致，
 * 切换按钮「变来变去」。现在四个页面把同一条分段控件钉在标题下方同一位置，
 * 当前视图高亮，切换时带着正在看的日期走（看 11 月的周切回月历不跑偏）。
 */
import { Link } from 'react-router'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export type ViewTab = 'month' | 'week' | 'schedule' | 'review'

const TABS: { id: ViewTab; label: MessageKey }[] = [
  { id: 'month', label: 'view.month' },
  { id: 'week', label: 'view.week' },
  { id: 'schedule', label: 'schedule.title' },
  { id: 'review', label: 'review.title' },
]

export default function ViewTabs({
  active,
  dayKey,
}: {
  active: ViewTab
  /** 当前正在看的某一天或某月中的代表日，切换后的页面停在同一段时间 */
  dayKey: string
}) {
  const { t } = useI18n()
  const monthKey = dayKey.slice(0, 7)

  function to(tab: ViewTab) {
    if (tab === 'month') return `/calendar?month=${monthKey}`
    if (tab === 'week') return `/week/${dayKey}`
    if (tab === 'schedule') return `/schedule?date=${dayKey}`
    return `/review?month=${monthKey}`
  }

  return (
    <nav
      aria-label={t('nav.calendar')}
      className="mt-3 flex items-center gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={to(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
          className={[
            'flex-1 rounded-lg py-1.5 text-center text-xs transition-colors',
            active === tab.id
              ? 'bg-brand/10 font-medium text-brand'
              : 'text-muted hover:text-fg',
          ].join(' ')}
        >
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  )
}
