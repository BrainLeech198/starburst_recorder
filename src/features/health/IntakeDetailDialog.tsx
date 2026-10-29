import type { HealthIntake } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { formatNum } from './healthMath'

/** 一笔摄入的营养成分表：总量 + 每 100g + 套餐的成分明细 */
export default function IntakeDetailDialog({
  intake,
  onClose,
}: {
  intake: HealthIntake
  onClose: () => void
}) {
  const { t } = useI18n()
  const per100 = (value: number) => (intake.grams > 0 ? (value / intake.grams) * 100 : 0)
  const rows = [
    { key: 'kcal', label: t('foods.kcal'), total: intake.kcal, scaled: per100(intake.kcal) },
    {
      key: 'protein',
      label: t('foods.protein'),
      total: intake.protein,
      scaled: per100(intake.protein),
    },
    { key: 'carbs', label: t('foods.carbs'), total: intake.carbs, scaled: per100(intake.carbs) },
    { key: 'fat', label: t('foods.fat'), total: intake.fat, scaled: per100(intake.fat) },
  ]

  return (
    <Modal size="sm" label={intake.name} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-baseline gap-2 text-base font-medium text-fg">
            <span className="truncate">{intake.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">{intake.code}</span>
          </p>
          <p className="m-0 mt-1 text-xs text-muted">
            {intake.dateKey} {intake.time} · {formatNum(intake.grams)} g ·{' '}
            {intake.source === 'library'
              ? t('health.detailSourceLibrary')
              : t('health.detailSourceManual')}
          </p>
        </div>
      </div>

      <p className="m-0 mt-4 text-xs font-medium text-muted">{t('health.detailMacros')}</p>
      <table className="mt-2 w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] text-muted">
            <th className="pb-1 font-normal">{t('health.detailNutrient')}</th>
            <th className="pb-1 text-right font-normal">{t('health.detailTotal')}</th>
            <th className="pb-1 text-right font-normal">{t('health.detailPer100')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line/60">
              <td className="py-1.5 text-fg">{row.label}</td>
              <td className="py-1.5 text-right text-fg">{formatNum(row.total)}</td>
              <td className="py-1.5 text-right text-muted">{formatNum(row.scaled)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {intake.components && intake.components.length > 0 && (
        <>
          <p className="m-0 mt-4 text-xs font-medium text-muted">{t('health.detailParts')}</p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {intake.components.map((part, index) => (
              <li
                key={`${part.foodId ?? 'manual'}-${index}`}
                className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-2 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-fg">{part.name}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatNum(part.grams)} g · {formatNum(part.kcal)} {t('health.kcalUnit')} ·{' '}
                  {t('health.legendProtein')} {formatNum(part.protein)} g
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(intake.tdeeSnapshot || intake.targetKcalSnapshot || intake.proteinTargetSnapshot) && (
        <p className="m-0 mt-4 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-muted">
          {t('health.detailTargets', {
            tdee: formatNum(intake.tdeeSnapshot),
            target: formatNum(intake.targetKcalSnapshot),
            protein: formatNum(intake.proteinTargetSnapshot),
          })}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={OUTLINE_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
