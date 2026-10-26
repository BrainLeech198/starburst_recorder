import RowCheckbox from '@/shared/ui/RowCheckbox'
import EmptyState from '@/shared/ui/EmptyState'
import { useState } from 'react'
import { Link } from 'react-router'
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { newCode, newId } from '@/core/utils/id'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import RowMenu from '@/shared/ui/RowMenu'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import FoodForm from './FoodForm'
import type { FoodDraft } from './FoodForm'
import MealForm from './MealForm'
import FoodInfoDialog from './FoodInfoDialog'
import { mealTotals } from './healthMath'
import {
  healthFoods,
  healthMeals,
  mergeHealthFoods,
  removeHealthFood,
  removeHealthFoods,
  removeHealthMeal,
  removeHealthMeals,
  restoreHealthFood,
  restoreHealthFoods,
  restoreHealthMeal,
  restoreHealthMeals,
  saveHealthFood,
  saveHealthMeal,
} from './healthRepo'

type Tab = 'foods' | 'meals'

/** 食物库按名字排：中文按拼音、数字按大小，跟文件管理器一个直觉 */
function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

/** 复制出来的名字：默认「原名 副本」，撞名就往后加序号 */
function copyName(base: string, foods: HealthFood[]): string {
  const name = `${base} 副本`
  if (!foods.some((food) => food.name === name)) return name
  let index = 2
  while (foods.some((food) => food.name === `${name} ${index}`)) index += 1
  return `${name} ${index}`
}

/**
 * 食物库：常吃的东西按每 100g 存一份，另记一个常用份量。
 * 「套餐」页签放整体食物（例如鸡腿饭），只存组合，营养按食物库实时算。
 */
export default function FoodLibraryPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const foods = useLiveQuery(() => healthFoods(), [])
  const meals = useLiveQuery(() => healthMeals(), [])
  const [tab, setTab] = useState<Tab>('foods')

  const [detailFood, setDetailFood] = useState<HealthFood | null>(null)
  const [editing, setEditing] = useState<HealthFood | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HealthFood | null>(null)

  /** 合并：先选「并进哪一条」，再确认；pendingMerge 非空时弹出确认框 */
  const [merging, setMerging] = useState<HealthFood | null>(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [pendingMerge, setPendingMerge] = useState<{ source: HealthFood; target: HealthFood } | null>(
    null,
  )

  const [editingMeal, setEditingMeal] = useState<HealthMeal | null>(null)
  const [mealFormOpen, setMealFormOpen] = useState(false)
  const [pendingMealDelete, setPendingMealDelete] = useState<HealthMeal | null>(null)

  /** 批量多选：食物和套餐各管各的，换页签就退出 */
  const batch = useBatchSelect()
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  function switchTab(next: Tab) {
    if (next === tab) return
    batch.exit()
    setTab(next)
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(food: HealthFood) {
    setEditing(food)
    setFormOpen(true)
  }

  function openCreateMeal() {
    setEditingMeal(null)
    setMealFormOpen(true)
  }

  function openEditMeal(meal: HealthMeal) {
    setEditingMeal(meal)
    setMealFormOpen(true)
  }

  async function handleSubmit(draft: FoodDraft) {
    const duplicated = (foods ?? []).some(
      (food) => food.id !== editing?.id && food.name.toLowerCase() === draft.name.toLowerCase(),
    )
    if (duplicated) {
      showToast({ message: t('foods.duplicate') })
      return
    }
    const now = Date.now()
    await saveHealthFood({
      id: editing?.id ?? newId(),
      code: editing?.code ?? newCode(),
      ...draft,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setFormOpen(false)
    showToast({ message: t('foods.saved') })
  }

  /** 复制一份：营养、份量原样带过来，名称加「副本」 */
  async function handleCopy(food: HealthFood) {
    // eslint-disable-next-line react-hooks/purity -- 在菜单回调里取时间，不在渲染期
    const now = Date.now()
    await saveHealthFood({
      ...food,
      id: newId(),
      code: newCode(),
      name: copyName(food.name, foods ?? []),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    showToast({ message: t('foods.copied') })
  }

  function openMerge(food: HealthFood) {
    setMerging(food)
    setMergeQuery('')
    setMergeTargetId(null)
  }

  async function handleMergeConfirm() {
    if (!pendingMerge) return
    const { source, target } = pendingMerge
    setPendingMerge(null)
    const stats = await mergeHealthFoods(source.id, target.id)
    showToast({
      message: t('foods.mergeDone', { intakes: stats.intakes, meals: stats.meals }),
    })
  }

  /** 套餐里的 AI 拆项可能带出库里没有的食物：先入库，再作为套餐组成 */
  async function createFoodForMeal(draft: FoodDraft): Promise<HealthFood> {
    const now = Date.now()
    const food: HealthFood = {
      id: newId(),
      code: newCode(),
      ...draft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthFood(food)
    return food
  }

  async function handleMealSubmit(draft: { name: string; items: { foodId: string; grams: number }[] }) {
    const duplicated = (meals ?? []).some(
      (meal) => meal.id !== editingMeal?.id && meal.name.toLowerCase() === draft.name.toLowerCase(),
    )
    if (duplicated) {
      showToast({ message: t('foods.mealDuplicate') })
      return
    }
    const now = Date.now()
    await saveHealthMeal({
      id: editingMeal?.id ?? newId(),
      name: draft.name,
      items: draft.items,
      createdAt: editingMeal?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setMealFormOpen(false)
    showToast({ message: t('foods.mealSaved') })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    await removeHealthFood(target.id)
    // 误删是常事：先给一条撤销，撤销不了再去回收站
    showToast({
      message: t('foods.deleted'),
      actionLabel: t('diary.undo'),
      onAction: () => void restoreHealthFood(target.id),
    })
  }

  async function handleMealDelete() {
    if (!pendingMealDelete) return
    const target = pendingMealDelete
    setPendingMealDelete(null)
    await removeHealthMeal(target.id)
    showToast({
      message: t('foods.mealDeleted'),
      actionLabel: t('diary.undo'),
      onAction: () => void restoreHealthMeal(target.id),
    })
  }

  async function handleBatchDelete() {
    const ids = batch.selected
    const isFoods = tab === 'foods'
    setBatchDeleteOpen(false)
    if (isFoods) await removeHealthFoods(ids)
    else await removeHealthMeals(ids)
    batch.clear()
    showToast({
      message: t(isFoods ? 'foods.batchDeletedFoods' : 'foods.batchDeletedMeals', {
        n: ids.length,
      }),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void (isFoods ? restoreHealthFoods(ids) : restoreHealthMeals(ids))
      },
    })
  }

  /** 可选的合并目标：除自己以外、按搜索词过滤 */
  const mergeKeyword = mergeQuery.trim().toLowerCase()
  const sortedFoods = [...(foods ?? [])].sort(byName)
  const sortedMeals = [...(meals ?? [])].sort(byName)

  const mergeList = (foods ?? [])
    .filter((food) => food.id !== merging?.id && food.name.toLowerCase().includes(mergeKeyword))
    .sort(byName)
  const mergeTarget = mergeTargetId
    ? (foods ?? []).find((food) => food.id === mergeTargetId) ?? null
    : null

  /** 当前页签里能选中的全部 id，批量工具条要用来全选 / 反选 */
  const selectableIds =
    tab === 'foods' ? (foods ?? []).map((food) => food.id) : (meals ?? []).map((meal) => meal.id)
  const batchUnit = t(tab === 'foods' ? 'foods.unitFood' : 'foods.unitMeal')
  const tabEmpty = tab === 'foods' ? (foods ?? []).length === 0 : (meals ?? []).length === 0

  return (
    <PageShell
      wide
      title={t('foods.title')}
      description={t('foods.description')}
      backTo="/health"
      backLabel={t('nav.health')}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/health/foods/trash" className={SOLID_BUTTON}>
            {t('foods.trash')}
          </Link>
          {!batch.active && (
            <>
              {tab === 'foods' ? (
                <button type="button" onClick={openCreate} className={SOLID_BUTTON}>
                  {t('foods.add')}
                </button>
              ) : (
                <button type="button" onClick={openCreateMeal} className={SOLID_BUTTON}>
                  {t('foods.addMeal')}
                </button>
              )}
              <button
                type="button"
                onClick={() => batch.enter()}
                disabled={tabEmpty}
                className={`${SOLID_BUTTON} disabled:opacity-40`}
              >
                {t('foods.batch')}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => switchTab('foods')}
          className={choiceTile(tab === 'foods', 'px-3 py-1.5 text-sm')}
        >
          {t('foods.tabFoods')}
        </button>
        <button
          type="button"
          onClick={() => switchTab('meals')}
          className={choiceTile(tab === 'meals', 'px-3 py-1.5 text-sm')}
        >
          {t('foods.tabMeals')}
        </button>
      </div>

      {tab === 'foods' &&
        (foods === undefined ? null : foods.length === 0 ? (
          <EmptyState icon="🍎" text={t('foods.empty')} />
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {sortedFoods.map((food) => {
              const selected = batch.isSelected(food.id)
              return (
                <li
                  key={food.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${
                    selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                  }`}
                >
                  {batch.active && (
                    <RowCheckbox
                      checked={selected}
                      label={food.name}
                      onToggle={() => batch.toggle(food.id)}
                    />
                  )}
                  <button
                    type="button"
                    disabled={batch.active}
                    onClick={() => setDetailFood(food)}
                    aria-label={food.name}
                    className="min-w-0 flex-1 rounded-lg text-left transition-colors hover:text-brand disabled:cursor-default"
                  >
                    <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                      <span className="truncate">{food.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">{food.code}</span>
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-muted">
                      {Math.round(food.kcal)} kcal / 100g · {t('foods.protein')} {food.protein} ·{' '}
                      {t('foods.carbs')} {food.carbs} · {t('foods.fat')} {food.fat}
                    </p>
                    {food.servingName && food.servingGrams && (
                      <p className="m-0 mt-0.5 text-xs text-muted">
                        {food.servingName} · {food.servingGrams} g
                      </p>
                    )}
                  </button>
                  {!batch.active && (
                    <RowMenu
                      label={t('common.more')}
                      items={[
                        { label: t('foods.edit'), onSelect: () => openEdit(food) },
                        { label: t('foods.copy'), onSelect: () => void handleCopy(food) },
                        { label: t('foods.merge'), onSelect: () => openMerge(food) },
                        {
                          label: t('foods.delete'),
                          danger: true,
                          onSelect: () => setPendingDelete(food),
                        },
                      ]}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'meals' &&
        (meals === undefined ? null : meals.length === 0 ? (
          <EmptyState icon="🍱" text={t('foods.mealEmpty')} />
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {sortedMeals.map((meal) => {
              const totals = mealTotals(meal.items, foods ?? [])
              const selected = batch.isSelected(meal.id)
              return (
                <li
                  key={meal.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${
                    selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                  }`}
                >
                  {batch.active && (
                    <RowCheckbox
                      checked={selected}
                      label={meal.name}
                      onToggle={() => batch.toggle(meal.id)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm text-fg">{meal.name}</p>
                    <p className="m-0 mt-0.5 text-xs text-muted">
                      {t('foods.mealItemCount', { n: totals.count })}
                      {totals.missing > 0 && (
                        <span className="ml-2 text-danger">
                          {t('foods.mealMissing', { n: totals.missing })}
                        </span>
                      )}
                    </p>
                    <p className="m-0 mt-0.5 text-xs text-muted">
                      {t('foods.mealTotal', {
                        kcal: totals.kcal,
                        protein: totals.protein,
                        grams: totals.grams,
                      })}
                    </p>
                  </div>
                  {!batch.active && (
                    <RowMenu
                      label={t('common.more')}
                      items={[
                        { label: t('foods.edit'), onSelect: () => openEditMeal(meal) },
                        {
                          label: t('foods.delete'),
                          danger: true,
                          onSelect: () => setPendingMealDelete(meal),
                        },
                      ]}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        ))}

      {batch.active && (
        <BatchActions select={batch} ids={selectableIds} unit={batchUnit}>
          <button
            type="button"
            onClick={() => setBatchDeleteOpen(true)}
            disabled={batch.count === 0}
            className={BAR_DANGER}
          >
            {t('foods.delete')}
          </button>
        </BatchActions>
      )}

      {batchDeleteOpen && (
        <ConfirmDialog
          title={t(
            tab === 'foods' ? 'foods.batchDeleteFoodsTitle' : 'foods.batchDeleteMealsTitle',
            { n: batch.count },
          )}
          description={t('foods.batchDeleteBody')}
          confirmLabel={t('foods.delete')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}

      {merging && (
        <Modal
          size="sm"
          label={t('foods.mergeTitle', { name: merging.name })}
          onClose={() => setMerging(null)}
        >
          <h2 className="m-0 text-base font-medium text-fg">
            {t('foods.mergeTitle', { name: merging.name })}
          </h2>
          <p className="m-0 mt-1 text-xs text-muted">{t('foods.mergeDesc')}</p>
          <input
            value={mergeQuery}
            onChange={(event) => setMergeQuery(event.target.value)}
            placeholder={t('foods.mergeSearch')}
            className={`${INPUT} mt-3`}
          />

          {mergeList.length === 0 ? (
            <p className="m-0 mt-3 text-xs text-muted">{t('foods.mergeEmpty')}</p>
          ) : (
            <ul className="m-0 mt-2 max-h-64 list-none space-y-1 overflow-y-auto p-0">
              {mergeList.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => setMergeTargetId(food.id)}
                    className={`block w-full rounded-lg border p-2 text-left transition-colors ${
                      mergeTargetId === food.id
                        ? 'border-brand bg-brand/10'
                        : 'border-line hover:border-brand/60'
                    }`}
                  >
                    <span className="block text-sm text-fg">{food.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {Math.round(food.kcal)} kcal / 100g · {t('foods.protein')} {food.protein} ·{' '}
                      {t('foods.carbs')} {food.carbs} · {t('foods.fat')} {food.fat}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setMerging(null)} className={`${OUTLINE_BUTTON} flex-1`}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!mergeTarget}
              onClick={() => {
                if (!mergeTarget) return
                setMerging(null)
                setPendingMerge({ source: merging, target: mergeTarget })
              }}
              className={`${SOLID_BUTTON} flex-1 disabled:opacity-40`}
            >
              {t('foods.merge')}
            </button>
          </div>
        </Modal>
      )}

      {pendingMerge && (
        <ConfirmDialog
          title={t('foods.mergeConfirmTitle', {
            source: pendingMerge.source.name,
            target: pendingMerge.target.name,
          })}
          description={t('foods.mergeConfirmDesc', {
            source: pendingMerge.source.name,
            target: pendingMerge.target.name,
          })}
          confirmLabel={t('foods.merge')}
          tone="brand"
          onConfirm={() => void handleMergeConfirm()}
          onCancel={() => setPendingMerge(null)}
        />
      )}

      {formOpen && (
        <Modal
          size="sm"
          label={t('foods.add')}
          onClose={() => setFormOpen(false)}
        >
          <h2 className="m-0 mb-3 text-base font-medium text-fg">
            {editing ? t('foods.edit') : t('foods.add')}
          </h2>
          <FoodForm initial={editing ?? undefined} submitLabel={t('foods.save')} onSubmit={handleSubmit} />
        </Modal>
      )}

      {mealFormOpen && (
        <Modal
          size="lg"
          label={editingMeal ? t('foods.mealEdit') : t('foods.addMeal')}
          onClose={() => setMealFormOpen(false)}
        >
          <h2 className="m-0 mb-3 text-base font-medium text-fg">
            {editingMeal ? t('foods.mealEdit') : t('foods.addMeal')}
          </h2>
          <MealForm
            initial={editingMeal ?? undefined}
            foods={foods ?? []}
            submitLabel={t('foods.mealSave')}
            onSubmit={handleMealSubmit}
            onCancel={() => setMealFormOpen(false)}
            onCreateFood={createFoodForMeal}
          />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('foods.deleteTitle', { name: pendingDelete.name })}
          description={t('foods.deleteDesc')}
          confirmLabel={t('foods.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingMealDelete && (
        <ConfirmDialog
          title={t('foods.mealDeleteTitle', { name: pendingMealDelete.name })}
          description={t('foods.mealDeleteDesc')}
          confirmLabel={t('foods.delete')}
          onConfirm={() => void handleMealDelete()}
          onCancel={() => setPendingMealDelete(null)}
        />
      )}

      {detailFood && <FoodInfoDialog food={detailFood} onClose={() => setDetailFood(null)} />}
    </PageShell>
  )
}
