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
}: {
  dayKey: string
  onChange: (next: string) => void
  onPick: () => void
  labels: { prev: string; next: string; pick: string; today: string }
  /** 左侧入口（例如二级页的返回）；放在日期控件前面，符合从左边退出的习惯 */
  leading?: ReactNode
  /** 右侧入口；窄屏时整体换到下一行，不挤日期 */
  trailing?: ReactNode
}) {
  const { t } = useI18n()
  const isToday = dayKey === todayKey()

  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/60 bg-bg/95 px-4 pb-2 pt-3 backdrop-blur">
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}

      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(shiftDay(dayKey, -1))}
          aria-label={labels.prev}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
        >
          ‹
        </button>

        {/* 日期本身就是日期选择入口 */}
        <button
          type="button"
          onClick={onPick}
          aria-label={labels.pick}
          className="font-hand flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:text-brand"
        >
          {/* 今天绿、其他日期黄：一眼知道在看哪一天 */}
          <span
            className={[
              'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
              isToday ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            ].join(' ')}
          >
            {t(relativeDayKey(dayKey))}
          </span>
          <span className="min-w-0 truncate text-sm">{formatDate(dayKey, t)}</span>
          <span className="hidden shrink-0 text-xs text-muted min-[360px]:inline">
            {t(weekdayKey(dayKey))}
          </span>
        </button>

        {!isToday && (
          <button
            type="button"
            onClick={() => onChange(todayKey())}
            className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
          >
            {labels.today}
          </button>
        )}

        <button
          type="button"
          onClick={() => onChange(shiftDay(dayKey, 1))}
          aria-label={labels.next}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
        >
          ›
        </button>
      </div>

      {trailing && <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  )
}
