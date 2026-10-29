import { formatMonthDay } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { WeighIn } from '@/core/db/schema'
import { trendPoints } from './healthViz'
import { formatNum } from './healthMath'

/** 折线图的内部分辨率；外层用 w-full 拉伸，手机上也不会糊 */
const WIDTH = 320
const HEIGHT = 96
const PAD = 16

/**
 * 体重趋势折线：点太稀时不画线，只给一句提示。
 * 纵轴不标具体刻度，只在右侧标出最高/最低值——四五个点看的是走势，不是读数。
 */
export default function WeightTrendChart({ items }: { items: WeighIn[] }) {
  const { t } = useI18n()

  if (items.length === 0) {
    return <p className="m-0 mt-2 text-xs text-muted">{t('health.trendEmpty')}</p>
  }

  const { points, min, max } = trendPoints(
    items.map((item) => item.weightKg),
    WIDTH,
    HEIGHT,
    PAD,
  )
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${points[0].x},${HEIGHT - PAD} ${line} ${points[points.length - 1].x},${HEIGHT - PAD}`

  return (
    <div className="mt-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('health.trendTitle')}
      >
        <line
          x1={0}
          y1={HEIGHT - PAD}
          x2={WIDTH}
          y2={HEIGHT - PAD}
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
        {points.map((point, index) => (
          <circle
            key={items[index].dateKey}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="currentColor"
            className="text-brand"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted">
        <span>{formatMonthDay(items[0].dateKey, t)}</span>
        <span className="text-fg">
          {formatNum(items[items.length - 1].weightKg)} {t('health.weighUnit')}
        </span>
        <span>{formatMonthDay(items[items.length - 1].dateKey, t)}</span>
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{t('health.weighUnit')}</span>
        <span>{max === min ? '' : `${formatNum(min)} – ${formatNum(max)} ${t('health.weighUnit')}`}</span>
      </div>
    </div>
  )
}
