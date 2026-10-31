/**
 * 套餐详情：只看不写，和食物详情同一个口径。
 *
 * 套餐在库里只存「食物 id + 克数」，营养按当前食物库实时算；
 * 被删掉的成分会标成「已删除的食物」，和列表里的「缺 N 项」对应。
 */
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON } from '@/shared/ui/buttonStyles'
import { foodMacros, formatNum, mealTotals } from './healthMath'

export default function MealInfoDialog({
  meal,
  foods,
  onClose,
}: {
  meal: HealthMeal
  foods: HealthFood[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const totals = mealTotals(meal.items, foods)
  const byId = new Map(foods.map((food) => [food.id, food]))

  return (
    <Modal size="sm" label={meal.name} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{meal.name}</h2>
      <p className="m-0 mt-1 text-xs text-muted">
        {t('foods.mealItemCount', { n: totals.count })}
        {totals.missing > 0 && (
          <span className="ml-2 text-danger">{t('foods.mealMissing', { n: totals.missing })}</span>
        )}
      </p>
      <p className="m-0 mt-1 text-sm tabular-nums text-fg">
        {t('foods.mealTotal', {
          kcal: formatNum(totals.kcal),
          protein: formatNum(totals.protein),
          grams: formatNum(totals.grams),
        })}
      </p>

      <ul className="m-0 mt-4 list-none space-y-1 p-0">
        {meal.items.map((item, index) => {
          const food = byId.get(item.foodId)
          const macros = food ? foodMacros(food, item.grams) : null
          return (
            <li
              key={`${item.foodId}-${index}`}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-2 px-2 py-1.5 text-xs"
            >
              <span className={`min-w-0 truncate ${food ? 'text-fg' : 'text-danger'}`}>
                {food ? food.name : t('foods.mealUnknownPart')}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatNum(item.grams)} g
                {macros && (
                  <>
                    {' · '}
                    {formatNum(macros.kcal)} {t('health.kcalUnit')}
                    {' · '}
                    {t('health.legendProtein')} {formatNum(macros.protein)} g
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
