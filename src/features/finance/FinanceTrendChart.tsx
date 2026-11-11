import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'

const WIDTH = 360
const HEIGHT = 188
const PLOT_LEFT = 52
const PLOT_RIGHT = 350
const PLOT_TOP = 20
const PLOT_BOTTOM = 158

export interface FinanceTrendPoint {
  key: string
  /** 图下方显示的短日期 */
  label: string
  /** 选中点时显示的完整日期或周区间 */
  detailLabel: string
  ariaLabel: string
  income: number
  expense: number
}

function niceMaximum(value: number) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * power
}

export default function FinanceTrendChart({
  points,
  ariaLabel,
  locale,
  money,
  className = 'mt-3',
}: {
  points: FinanceTrendPoint[]
  ariaLabel: string
  locale: string
  money: (value: number) => string
  className?: string
}) {
  const { t } = useI18n()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const maxValue = Math.max(0, ...points.flatMap((point) => [point.income, point.expense]))
  const scaleMaximum = niceMaximum(maxValue)
  const baseline = PLOT_BOTTOM
  const x = (index: number) =>
    points.length === 1
      ? (PLOT_LEFT + PLOT_RIGHT) / 2
      : PLOT_LEFT + (index * (PLOT_RIGHT - PLOT_LEFT)) / (points.length - 1)
  const y = (value: number) =>
    PLOT_BOTTOM - (value / scaleMaximum) * (PLOT_BOTTOM - PLOT_TOP)
  const incomePoints = points.map((point, index) => `${x(index)},${y(point.income)}`).join(' ')
  const expensePoints = points.map((point, index) => `${x(index)},${y(point.expense)}`).join(' ')
  const incomeArea = `${x(0)},${baseline} ${incomePoints} ${x(points.length - 1)},${baseline}`
  const expenseArea = `${x(0)},${baseline} ${expensePoints} ${x(points.length - 1)},${baseline}`
  const ticks = [scaleMaximum, scaleMaximum / 2, 0]
  const selectedIndex = selectedKey ? points.findIndex((point) => point.key === selectedKey) : -1
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null
  const axisMoney = (value: number) =>
    `${t('finance.currency')}${new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)}`
  const percent = (value: number) => `${(value / HEIGHT) * 100}%`

  function selectPoint(key: string) {
    setSelectedKey(key)
  }

  return (
    <div className={className}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          className="block h-auto w-full"
          role="group"
          aria-label={ariaLabel}
        >
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={PLOT_LEFT}
              y1={y(tick)}
              x2={PLOT_RIGHT}
              y2={y(tick)}
              stroke="currentColor"
              className="text-line"
              strokeWidth={1}
              strokeDasharray={tick === 0 ? undefined : '2 3'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polygon points={incomeArea} fill="currentColor" className="text-success/10" />
          <polygon points={expenseArea} fill="currentColor" className="text-danger/10" />
          <polyline
            points={incomePoints}
            fill="none"
            stroke="currentColor"
            className="text-success"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={expensePoints}
            fill="none"
            stroke="currentColor"
            className="text-danger"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {selectedPoint && (
            <line
              x1={x(selectedIndex)}
              y1={PLOT_TOP}
              x2={x(selectedIndex)}
              y2={PLOT_BOTTOM}
              stroke="currentColor"
              className="text-brand/40"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {points.map((point, index) => {
            const active = point.key === selectedKey
            const highlighted = active || point.key === focusedKey
            return (
              <g
                key={point.key}
                role="button"
                tabIndex={0}
                aria-label={point.ariaLabel}
                aria-pressed={active}
                className="cursor-pointer"
                onFocus={() => setFocusedKey(point.key)}
                onBlur={() => setFocusedKey(null)}
                onClick={() => selectPoint(point.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectPoint(point.key)
                  }
                }}
              >
                <circle cx={x(index)} cy={y(point.income)} r={12} fill="transparent" />
                <circle cx={x(index)} cy={y(point.expense)} r={12} fill="transparent" />
                {highlighted && (
                  <>
                    <circle
                      cx={x(index)}
                      cy={y(point.income)}
                      r={8}
                      fill="none"
                      stroke="currentColor"
                      className="text-success/40"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={x(index)}
                      cy={y(point.expense)}
                      r={8}
                      fill="none"
                      stroke="currentColor"
                      className="text-danger/40"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
                <circle
                  cx={x(index)}
                  cy={y(point.income)}
                  r={active ? 4.5 : 3}
                  fill="currentColor"
                  className="text-success"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={x(index)}
                  cy={y(point.expense)}
                  r={active ? 4.5 : 3}
                  fill="currentColor"
                  className="text-danger"
                  vectorEffect="non-scaling-stroke"
                />
                <title>{point.ariaLabel}</title>
              </g>
            )
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute left-0 w-11 -translate-y-1/2 text-right text-[10px] tabular-nums text-muted"
              style={{ top: percent(y(tick)) }}
            >
              {axisMoney(tick)}
            </span>
          ))}
          {selectedPoint && (
            <div
              className="absolute z-10 max-w-[15rem] rounded-lg border border-line bg-surface px-2 py-1 text-[10px] shadow-sm"
              style={{
                left: `${(x(selectedIndex) / WIDTH) * 100}%`,
                top: percent(y(Math.max(selectedPoint.income, selectedPoint.expense))),
                transform:
                  (x(selectedIndex) < 80
                    ? 'translate(0, '
                    : x(selectedIndex) > WIDTH - 80
                      ? 'translate(-100%, '
                      : 'translate(-50%, ') +
                  (y(Math.max(selectedPoint.income, selectedPoint.expense)) > 52
                    ? 'calc(-100% - 8px))'
                    : '8px)'),
              }}
            >
              <div className="whitespace-nowrap font-medium text-fg">{selectedPoint.detailLabel}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums">
                <span className="whitespace-nowrap text-success">
                  {t('finance.income')} {money(selectedPoint.income)}
                </span>
                <span className="whitespace-nowrap text-danger">
                  {t('finance.expense')} {money(selectedPoint.expense)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-1 h-4 text-[10px] tabular-nums text-muted">
        {points.map((point, index) => (
          <span
            key={point.key}
            className={`absolute whitespace-nowrap ${
              index === 0 ? '' : index === points.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
            }`}
            style={{ left: `${(x(index) / WIDTH) * 100}%` }}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  )
}
