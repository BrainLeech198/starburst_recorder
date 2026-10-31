import { formatMonthDay } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { WeighIn } from '@/core/db/schema'
import { trendPoints } from './healthViz'
import { formatNum } from './healthMath'

/** 折线图的内部分辨率；外层用 w-full 拉伸，手机上也不会糊 */
const WIDTH = 320
const SMALL_HEIGHT = 96
const TALL_HEIGHT = 150

/**
 * 体重趋势折线：点太稀时不画线，只给一句提示。
 * 纵轴不标具体刻度，只在右侧标出最高/最低值——四五个点看的是走势，不是读数。
 *
 * 详情页传 `onSelect` 时每个点都可点、可 Tab 聚焦，选中点会加一圈高亮和一条竖线；
 * 首页小卡片不传，行为跟以前一样。
 */
export default function WeightTrendChart({
  items,
  selected = null,
  onSelect,
  tall = false,
  className = 'mt-2',
}: {
  items: WeighIn[]
  /** 当前选中的日期，'YYYY-MM-DD' */
  selected?: string | null
  /** 点了某个点；不传就是纯展示 */
  onSelect?: (dateKey: string) => void
  /** 详情页用更高的画布 */
  tall?: boolean
  className?: string
}) {
  const { t } = useI18n()

  if (items.length === 0) {
    return <p className="m-0 mt-2 text-xs text-muted">{t('health.trendEmpty')}</p>
  }

  const height = tall ? TALL_HEIGHT : SMALL_HEIGHT
  const pad = tall ? 18 : 16
  const { points, min, max } = trendPoints(
    items.map((item) => item.weightKg),
    WIDTH,
    height,
    pad,
  )
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${points[0].x},${height - pad} ${line} ${points[points.length - 1].x},${height - pad}`
  const selectedIndex = selected ? items.findIndex((item) => item.dateKey === selected) : -1
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null

  function activate(dateKey: string) {
    onSelect?.(dateKey)
  }

  return (
    <div className={className}>
      {/* 不锁 height、也不拉伸：viewBox 自带比例，窄屏只会整体缩小，
          点不会被拉成椭圆，线也不会被压扁 */}
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        className="mt-1 h-auto w-full"
        role="img"
        aria-label={t('health.trendTitle')}
      >
        <line
          x1={0}
          y1={height - pad}
          x2={WIDTH}
          y2={height - pad}
          stroke="currentColor"
          className="text-line"
          strokeWidth={1}
        />
        {points.length > 1 && (
          <polygon points={area} fill="currentColor" className="text-brand/10" stroke="none" />
        )}
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          className="text-brand"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 选中日期的竖线先画，别压住圆点 */}
        {selectedPoint && (
          <line
            x1={selectedPoint.x}
            y1={pad / 2}
            x2={selectedPoint.x}
            y2={height - pad}
            stroke="currentColor"
            className="text-brand/30"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((point, index) => {
          const item = items[index]
          const active = item.dateKey === selected
          const interactive = onSelect !== undefined
          return (
            <g
              key={item.dateKey}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={t('health.trendPointLabel', {
                date: formatMonthDay(item.dateKey, t),
                value: formatNum(item.weightKg),
              })}
              aria-pressed={interactive ? active : undefined}
              className={interactive ? 'cursor-pointer outline-none' : undefined}
              onClick={interactive ? () => activate(item.dateKey) : undefined}
              onKeyDown={
                interactive
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        activate(item.dateKey)
                      }
                    }
                  : undefined
              }
            >
              {/* 透明的大圆只负责扩大点击 / 触控范围 */}
              {interactive && <circle cx={point.x} cy={point.y} r={12} fill="transparent" />}
              {active && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={8}
                  fill="none"
                  stroke="currentColor"
                  className="text-brand/40"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={active ? 4.5 : 3}
                fill="currentColor"
                className={active ? 'text-brand' : 'text-brand/80'}
                vectorEffect="non-scaling-stroke"
              />
              <title>
                {`${formatMonthDay(item.dateKey, t)} · ${formatNum(item.weightKg)} ${t('health.weighUnit')}`}
              </title>
            </g>
          )
        })}
      </svg>
      {/* 两行摊开：第一行只放首尾日期，第二行放最新体重和区间，窄屏不会三个数字挤成一团 */}
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted">
        <span className="whitespace-nowrap">{formatMonthDay(items[0].dateKey, t)}</span>
        <span className="whitespace-nowrap">{formatMonthDay(items[items.length - 1].dateKey, t)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] tabular-nums">
        <span className="whitespace-nowrap text-fg">
          {formatNum(items[items.length - 1].weightKg)} {t('health.weighUnit')}
        </span>
        <span className="whitespace-nowrap text-muted">
          {max === min ? '' : `${formatNum(min)} – ${formatNum(max)} ${t('health.weighUnit')}`}
        </span>
      </div>
    </div>
  )
}
