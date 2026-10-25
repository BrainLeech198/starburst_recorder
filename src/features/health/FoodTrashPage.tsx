/**
 * 食物库回收站。
 *
 * 食物和套餐删除只是把 deletedAt 写上，历史摄入存的是当时那份快照，
 * 所以删掉不影响已经记过的账；这里只负责恢复或彻底删掉。
 */
import { useState } from 'react'
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatStamp } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { BAR_BUTTON, BAR_DANGER, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import {
  purgeHealthFood,
  purgeHealthMeal,
  purgeTrashedHealthFoods,
  purgeTrashedHealthMeals,
  restoreHealthFood,
  restoreHealthMeal,
  trashedHealthFoods,
  trashedHealthMeals,
} from './healthRepo'

type TrashRow = { kind: 'food'; food: HealthFood } | { kind: 'meal'; meal: HealthMeal }

/** 弹窗确认的对象：一条（食物或套餐），或者整个回收站 */
type Pending = { kind: 'one'; row: TrashRow } | { kind: 'all' }

function rowName(row: TrashRow) {
  return row.kind === 'food' ? row.food.name : row.meal.name
}

function rowDeletedAt(row: TrashRow) {
  return (row.kind === 'food' ? row.food.deletedAt : row.meal.deletedAt) ?? 0
}

export default function FoodTrashPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const foods = useLiveQuery(() => trashedHealthFoods(), [])
  const meals = useLiveQuery(() => trashedHealthMeals(), [])
  const [pending, setPending] = useState<Pending | null>(null)

  const rows: TrashRow[] = [
    ...(foods ?? []).map((food): TrashRow => ({ kind: 'food', food })),
    ...(meals ?? []).map((meal): TrashRow => ({ kind: 'meal', meal })),
  ].sort((a, b) => rowDeletedAt(b) - rowDeletedAt(a))

  const loaded = foods !== undefined && meals !== undefined
  const isEmpty = loaded && rows.length === 0

  async function handleRestore(row: TrashRow) {
    if (row.kind === 'food') await restoreHealthFood(row.food.id)
    else await restoreHealthMeal(row.meal.id)
    showToast({ message: t('foodTrash.restored') })
  }

  async function handleConfirm() {
    if (!pending) return
    const target = pending
    setPending(null)
    if (target.kind === 'one') {
      if (target.row.kind === 'food') await purgeHealthFood(target.row.food.id)
      else await purgeHealthMeal(target.row.meal.id)
      showToast({ message: t('foodTrash.purged') })
      return
    }
    await purgeTrashedHealthFoods()
    await purgeTrashedHealthMeals()
    showToast({ message: t('foodTrash.cleared') })
  }

  return (
    <PageShell
      wide
      title={t('foodTrash.title')}
      description={t('foodTrash.description')}
      backTo="/health/foods"
      backLabel={t('foods.title')}
      actions={
        <button
          type="button"
          onClick={() => setPending({ kind: 'all' })}
          disabled={isEmpty}
          className={`${SOLID_DANGER} disabled:opacity-40`}
        >
          {t('foodTrash.clear')}
        </button>
      }
    >
      {!loaded ? null : rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t('foodTrash.empty')}</p>
      ) : (
        <>
          <p className="m-0 text-xs text-muted">{t('foodTrash.count', { n: rows.length })}</p>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {rows.map((row) => (
              <li
                key={row.kind === 'food' ? row.food.id : row.meal.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm text-fg">
                    {rowName(row)}
                    {row.kind === 'food' && (
                      <span className="ml-2 font-mono text-[10px] text-muted">{row.food.code}</span>
                    )}
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                      {row.kind === 'food' ? t('foods.tabFoods') : t('foods.tabMeals')}
                    </span>
                  </p>
                  {row.kind === 'food' ? (
                    <p className="m-0 mt-0.5 text-xs text-muted">
                      {Math.round(row.food.kcal)} kcal / 100g · {t('foods.protein')} {row.food.protein} ·{' '}
                      {t('foods.carbs')} {row.food.carbs} · {t('foods.fat')} {row.food.fat}
                    </p>
                  ) : (
                    <p className="m-0 mt-0.5 text-xs text-muted">
                      {t('foods.mealItemCount', { n: row.meal.items.length })}
                    </p>
                  )}
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {t('foodTrash.deletedAt', { at: formatStamp(rowDeletedAt(row)) })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => void handleRestore(row)} className={BAR_BUTTON}>
                    {t('foodTrash.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: 'one', row })}
                    className={BAR_DANGER}
                  >
                    {t('foodTrash.purge')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'one'
              ? t('foodTrash.purgeOneTitle', { name: rowName(pending.row) })
              : t('foodTrash.clearTitle')
          }
          description={pending.kind === 'one' ? t('foodTrash.purgeOneDesc') : t('foodTrash.clearDesc')}
          confirmLabel={pending.kind === 'one' ? t('foodTrash.purge') : t('foodTrash.clear')}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
