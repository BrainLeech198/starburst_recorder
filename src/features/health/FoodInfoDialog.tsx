/**
 * 食物详情：只看不写。
 *
 * 列表一行塞不下完整信息（份量、编号、四项营养），点一下把这一条摊开看；
 * 要改的话还是走「⋯ → 编辑」，这里刻意不放操作按钮，免得又变成第二个编辑页。
 */
import type { HealthFood } from '@/core/db/schema'
import Modal from '@/shared/ui/Modal'
import { useI18n } from '@/shared/i18n/context'

export default function FoodInfoDialog({
  food,
  onClose,
}: {
  food: HealthFood
  onClose: () => void
}) {
  const { t } = useI18n()

  const facts = [
    { label: t('foods.kcal'), value: Math.round(food.kcal), unit: 'kcal' },
    { label: t('foods.protein'), value: food.protein, unit: 'g' },
    { label: t('foods.carbs'), value: food.carbs, unit: 'g' },
    { label: t('foods.fat'), value: food.fat, unit: 'g' },
  ]

  return (
    <Modal size="sm" label={food.name} onClose={onClose}>
      <h2 className="m-0 flex flex-wrap items-baseline gap-2 text-base font-medium text-fg">
        {food.name}
        <span className="font-mono text-[10px] text-muted">{food.code}</span>
      </h2>

      <p className="mt-3 text-xs text-muted">{t('foods.per100')}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">{fact.label}</div>
            <div className="mt-0.5 font-hand text-lg tabular-nums text-fg">
              {fact.value}
              <span className="ml-1 text-xs text-muted">{fact.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {food.servingName && food.servingGrams ? (
        <p className="mt-3 text-xs text-muted">
          {t('foods.servingName')}：{food.servingName} · {food.servingGrams} g
        </p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
