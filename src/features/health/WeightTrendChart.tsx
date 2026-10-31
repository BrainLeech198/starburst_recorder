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
      {/* 不锁 height、也不拉伸：viewBox 自带 320:96 比例，窄屏只会整体缩小，
          点不会被拉成椭圆，线也不会被压扁 */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        className="mt-1 h-auto w-full"
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
