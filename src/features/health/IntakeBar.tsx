import { useI18n } from '@/shared/i18n/context'
import {
  KCAL_PER_GRAM,
  MACRO_COLORS,
  MACRO_KEYS,
  barPercent,
  barScale,
  macroKcal,
} from './healthMath'
import type { Macros } from './healthMath'

/**
 * 今日摄入条：横轴是热量，固定量程到 TDEE×1.35。
 * 条身按三大营养素的热量占比分段上色，超出 TDEE 的部分叠一层红。
 */
export default function IntakeBar({
  totals,
  tdee,
  target,
}: {
  totals: Macros
  tdee: number | null
  target: number | null
}) {
  const { t } = useI18n()
  const scale = barScale(tdee)
  if (scale <= 0) return null

  const eatenPct = barPercent(totals.kcal, scale)
  const targetPct = target && target > 0 ? barPercent(target, scale) : 0
  const tdeePct = barPercent(scale / 1.35, scale)

  const macroTotal = macroKcal(totals.protein, totals.carbs, totals.fat)
  const overPct = Math.max(0, eatenPct - tdeePct)

  return (
    <div
      className="mt-3"
      role="img"
      aria-label={t('health.barAria', {
        eaten: Math.round(totals.kcal),
        target: target ?? 0,
      })}
    >
      <div className="relative h-4 overflow-hidden rounded-full bg-line/40">
        {macroTotal > 0 ? (
          <div className="flex h-full w-full">
            {MACRO_KEYS.map((key) => {
              const kcal = totals[key] * KCAL_PER_GRAM[key]
              if (kcal <= 0) return null
              return (
                <span
                  key={key}
                  style={{ width: `${(kcal / scale) * 100}%`, background: MACRO_COLORS[key] }}
                />
              )
            })}
          </div>
        ) : (
          <span className="block h-full" style={{ width: `${eatenPct}%` }} />
        )}

        {overPct > 0 && (
          <span
            className="absolute inset-y-0 bg-danger/55"
            style={{ left: `${tdeePct}%`, width: `${overPct}%` }}
          />
        )}

        {target && target > 0 && (
          <span
            className="absolute inset-y-0 w-px bg-fg/50"
            style={{ left: `${targetPct}%` }}
          />
        )}
        <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${tdeePct}%` }} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {MACRO_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1">
            <i
              aria-hidden="true"
              className="h-2 w-2 rounded-sm"
              style={{ background: MACRO_COLORS[key] }}
            />
            {t(
              key === 'protein'
                ? 'health.legendProtein'
                : key === 'carbs'
                  ? 'health.legendCarbs'
                  : 'health.legendFat',
            )}{' '}
            {Math.round(totals[key])}g
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i aria-hidden="true" className="h-2.5 w-px bg-fg/50" />
          {t('health.targetLine', { value: target ?? 0 })}
        </span>
        <span className="inline-flex items-center gap-1">
          <i aria-hidden="true" className="h-2.5 w-0.5 bg-fg" />
          {t('health.tdeeLine', { value: Math.round(scale / 1.35) })}
        </span>
      </div>
    </div>
  )
}

/**
 * 蛋白的辅助进度条：比文字更直观，吃完多少一眼能看出来。
 * 满格是目标克数的 1.5 倍，目标线画在 2/3 处，方便看还差多少。
 * 颜色从 0% 的红渐变到 100% 的绿，超过目标后转成超额色。
 * 没有目标时只显示吃了多少，条留在起点。
 */
export function ProteinBar({ value, target }: { value: number; target: number | null }) {
  const { t } = useI18n()
  const eaten = Math.round(value)
  const goal = target && target > 0 ? Math.round(target) : null
  const scale = goal !== null ? goal * 1.5 : 0
  const scalePct = goal !== null ? Math.min(100, Math.max(0, (value / scale) * 100)) : 0
  const targetPct = 100 / 1.5
  const ratio = goal !== null ? value / goal : 0
  const over = goal !== null && value > goal
  // 0% 红 → 100% 绿；超过目标换成警告色，一眼能看出「超额」
  const fillColor = over ? 'var(--color-warning)' : `hsl(${Math.min(120, ratio * 120)} 70% 42%)`

  return (
    <div
      className="mt-2"
      role="img"
      aria-label={
        goal !== null
          ? t('health.proteinBarAria', { value: eaten, target: goal })
          : t('health.proteinBarAriaNoTarget', { value: eaten })
      }
    >
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{t('health.legendProtein')}</span>
        <span className={`tabular-nums ${over ? 'text-warning' : 'text-muted'}`}>
          {goal !== null
            ? t('health.proteinBarValues', { value: eaten, target: goal })
            : t('health.proteinBarValueOnly', { value: eaten })}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-line/40">
        <span
          className="block h-full rounded-full"
          style={{ width: `${scalePct}%`, background: fillColor }}
        />
        {goal !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-fg/45"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>
    </div>
  )
}
