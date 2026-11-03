/**
 * 日期栏：‹ 日期 ›，外加各页面自己的快捷入口。
 *
 * 这一条吸在内容区顶部常驻：日记、健康首页、摄入 / 睡眠 / 体重都在用，
 * 长列表往下翻的时候还能直接换天。左侧 leading 放二级页返回，右侧 trailing
 * 由页面决定（日记是日记/随记，健康是食物库/档案），入口会跟着日期一起常驻。
 *
 * 吸顶要有底色：半透明背景 + 模糊，滚上来的内容不会在字缝里透出来。
 * 页面容器都是 p-4，这里用负外边距抵掉左边距，让栏铺到容器边缘。
 */
import type { ReactNode } from 'react'
import { formatDate, relativeDayKey, shiftDay, todayKey, weekdayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'

export default function DayNav({
  dayKey,
  onChange,
  onPick,
  labels,
  leading,
  trailing,
  inset = true,
  className = '',
}: {
  dayKey: string
  onChange: (next: string) => void
  onPick: () => void
  labels: { prev: string; next: string; pick: string; today: string }
  /** 左侧入口（例如二级页的返回）；放在日期控件前面，符合从左边退出的习惯 */
  leading?: ReactNode
  /** 右侧入口；窄屏时整体换到下一行，不挤日期 */
  trailing?: ReactNode
  /**
   * 是否为页面第一个元素。默认是：用负外边距抵掉容器 p-4，铺到边缘、顶到顶。
   * 放在标题等其它内容后面时传 false，否则负上边距会把前面的按钮盖住。
   */
  inset?: boolean
  /** 追加布局类（如 mt-2）；放在固定样式后面，能覆盖同名边距 */
  className?: string
}) {
  const { t } = useI18n()
  const isToday = dayKey === todayKey()

  return (
    <div
      className={[
        // @container：下面靠「这一条到底有多宽」决定星期 / 相对日要不要让位，
        // 不能用屏幕宽度——文字放大后可用空间变小，视口宽度却没变
        '@container sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-1 bg-bg/95 px-4 backdrop-blur',
        '-mx-4',
        inset ? '-mt-4 pb-2 pt-3' : 'pb-2 pt-2',
        className,
      ].join(' ')}
    >
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}

      {/* 日期控件单独收进一个圆角矩形里，和信息更细的日期内容配在一起 */}
      <div className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-surface px-1 py-0.5">
        <button
          type="button"
          onClick={() => onChange(shiftDay(dayKey, -1))}
          aria-label={labels.prev}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
        >
          ‹
        </button>

        {/* 日期本身就是日期选择入口。三条信息的取舍顺序：
            日期永远完整（不截断）；相对日（是今天 / 昨天）和星期是重复信息，
            这一条放不下时整段隐藏，而不是把日期截成「2026年11…」。
            阈值按容器宽度、单位用 rem——字号放大时阈值跟着放大。
            非今天时右边多一个「今天」按钮，相对日本身也更含糊（前几天 / 后几天），
            所以门槛抬高一档，先让位给它。 */}
        <button
          type="button"
          onClick={onPick}
          aria-label={labels.pick}
          className="font-hand flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
        >
          {/* 今天绿、其他日期黄：一眼知道在看哪一天 */}
          <span
            className={[
              'hidden shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
              isToday ? '@min-[17.5rem]:inline' : '@min-[22rem]:inline',
              isToday ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            ].join(' ')}
          >
            {t(relativeDayKey(dayKey))}
          </span>
          <span className="shrink-0 whitespace-nowrap text-sm">{formatDate(dayKey, t)}</span>
          <span className="hidden shrink-0 text-xs text-muted @min-[20rem]:inline">
            {t(weekdayKey(dayKey))}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChange(shiftDay(dayKey, 1))}
          aria-label={labels.next}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
        >
          ›
        </button>
      </div>

      {/* 「回到今天」放在日期框外面：这一条放不下时它会自己换到下一行，不挤日期 */}
      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(todayKey())}
          className="shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
        >
          {labels.today}
        </button>
      )}

      {trailing && <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  )
}
