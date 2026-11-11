import RowCheckbox from '@/shared/ui/RowCheckbox'
import EmptyState from '@/shared/ui/EmptyState'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { HealthFood, HealthMeal } from '@/core/db/schema'
import type { HealthFoodBrief, HealthMealBrief } from '@/core/db/store'
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
import { Icon } from '@/shared/ui/icons'
import { INPUT } from '@/shared/ui/inputStyles'
import TagEditor from '@/shared/ui/TagEditor'
import FoodForm from './FoodForm'
import type { FoodDraft } from './FoodForm'
import MealForm from './MealForm'
import FoodInfoDialog from './FoodInfoDialog'
import FoodPhotoThumbnail from './FoodPhotoThumbnail'
import MealInfoDialog from './MealInfoDialog'
import ShareDialog from '@/features/share/ShareDialog'
import ShareReceiveDialog from '@/features/share/ShareReceiveDialog'
import { buildFoodShare, buildMealShare } from './foodShare'
import type { ShareDoc } from '@/features/share/shareCode'
import { formatNum, mealTotals } from './healthMath'
import FoodSortControls from './FoodSortControls'
import type { FoodSortDirection, FoodSortKey } from './foodSort'
import { sortFoodCatalog } from './foodSort'
import {
  healthFoodBriefs,
  healthFoodById,
  healthMealBriefs,
  healthMealById,
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

const LIBRARY_PAGE_SIZE = 40

/** 复制出来的名字：默认「原名 副本」，撞名就往后加序号 */
function copyName(base: string, foods: { name: string }[], suffix: string): string {
  const name = `${base} ${suffix}`
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
  const foods = useLiveQuery(() => healthFoodBriefs(), [])
  const meals = useLiveQuery(() => healthMealBriefs(), [])
  const [tab, setTab] = useState<Tab>('foods')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<FoodSortKey>('name')
  const [sortDirection, setSortDirection] = useState<FoodSortDirection>('asc')
  const [foodPage, setFoodPage] = useState({ key: '', count: LIBRARY_PAGE_SIZE })
  const [mealPage, setMealPage] = useState({ key: '', count: LIBRARY_PAGE_SIZE })

  const [detailFood, setDetailFood] = useState<HealthFood | null>(null)
  const [editing, setEditing] = useState<HealthFood | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HealthFoodBrief | null>(null)

  /** 合并：先选「并进哪一条」，再确认；pendingMerge 非空时弹出确认框 */
  const [merging, setMerging] = useState<HealthFoodBrief | null>(null)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [pendingMerge, setPendingMerge] = useState<{ source: HealthFoodBrief; target: HealthFoodBrief } | null>(
    null,
  )

  const [editingMeal, setEditingMeal] = useState<HealthMeal | null>(null)
  const [mealFormOpen, setMealFormOpen] = useState(false)
  const [detailMeal, setDetailMeal] = useState<HealthMeal | null>(null)
  const [pendingMealDelete, setPendingMealDelete] = useState<HealthMealBrief | null>(null)

  /** 批量多选：食物和套餐各管各的，换页签就退出 */
  const batch = useBatchSelect()
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  /** 正在分享的食物 / 套餐；非空就打开分享弹窗 */
  const [sharing, setSharing] = useState<ShareDoc | null>(null)
  const [receiving, setReceiving] = useState(false)

  function switchTab(next: Tab) {
    if (next === tab) return
    batch.exit()
    setTab(next)
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  async function openEdit(food: HealthFoodBrief) {
    const fullFood = await healthFoodById(food.id)
    if (!fullFood) return
    setEditing(fullFood)
    setFormOpen(true)
  }

  async function openFoodInfo(food: HealthFoodBrief) {
    const fullFood = await healthFoodById(food.id)
    if (fullFood) setDetailFood(fullFood)
  }

  function openCreateMeal() {
    setEditingMeal(null)
    setMealFormOpen(true)
  }

  async function openEditMeal(meal: HealthMealBrief) {
    const fullMeal = await healthMealById(meal.id)
    if (!fullMeal) return
    setEditingMeal(fullMeal)
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
      tags: draft.tags ?? [],
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setFormOpen(false)
    showToast({ message: t('foods.saved') })
  }

  /** 复制一份：营养、份量原样带过来，名称加「副本」 */
  async function handleCopy(food: HealthFoodBrief) {
    const fullFood = await healthFoodById(food.id)
    if (!fullFood) return
    // eslint-disable-next-line react-hooks/purity -- 在菜单回调里取时间，不在渲染期
    const now = Date.now()
    await saveHealthFood({
      ...fullFood,
      id: newId(),
      code: newCode(),
      name: copyName(food.name, foods ?? [], t('foods.copySuffix')),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    showToast({ message: t('foods.copied') })
  }

  function openMerge(food: HealthFoodBrief) {
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
      tags: draft.tags ?? [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthFood(food)
    return food
  }

  /** 复制套餐：成分和克数原样带过来，名称加「副本」 */
  async function handleCopyMeal(meal: HealthMealBrief) {
    const fullMeal = await healthMealById(meal.id)
    if (!fullMeal) return
    // eslint-disable-next-line react-hooks/purity -- 在菜单回调里取时间，不在渲染期
    const now = Date.now()
    await saveHealthMeal({
      ...fullMeal,
      id: newId(),
      name: copyName(meal.name, meals ?? [], t('foods.copySuffix')),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    showToast({ message: t('foods.mealCopied') })
  }

  /** 分享套餐：成分缺得太多（没有可带的内容）时提示一句 */
  async function shareMeal(meal: HealthMealBrief) {
    const fullMeal = await healthMealById(meal.id)
    if (!fullMeal) return
    const fullFoods = await Promise.all(
      fullMeal.items.map((item) => healthFoodById(item.foodId)),
    )
    const doc = buildMealShare(fullMeal, fullFoods.filter((item): item is HealthFood => item !== undefined))
    if (doc) setSharing(doc)
    else showToast({ message: t('share.mealEmpty') })
  }

  async function handleMealSubmit(draft: {
    name: string
    photo: string | null
    items: { foodId: string; grams: number }[]
  }) {
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
      photo: draft.photo,
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
  const keyword = query.trim().toLowerCase()
  const sortedFoods = useMemo(
    () => sortFoodCatalog(foods ?? [], sortKey, sortDirection),
    [foods, sortKey, sortDirection],
  )
  const sortedMeals = useMemo(
    () => sortFoodCatalog(meals ?? [], sortKey, sortDirection),
    [meals, sortKey, sortDirection],
  )
  const foodTags = useMemo(
    () => [...new Set(sortedFoods.flatMap((food) => food.tags))].sort((a, b) =>
      a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    ),
    [sortedFoods],
  )
  const filteredFoods = useMemo(() => sortedFoods.filter((food) => {
    const matchesSearch = !keyword || food.name.toLowerCase().includes(keyword)
    const matchesTag = tagFilter === null
      || (tagFilter === '' ? food.tags.length === 0 : food.tags.includes(tagFilter))
    return matchesSearch && matchesTag
  }), [keyword, sortedFoods, tagFilter])
  const filteredMeals = useMemo(
    () => keyword
      ? sortedMeals.filter((meal) => meal.name.toLowerCase().includes(keyword))
      : sortedMeals,
    [keyword, sortedMeals],
  )
  const foodFilterKey = `${keyword}\u0000${tagFilter ?? 'all'}\u0000${sortKey}\u0000${sortDirection}`
  const mealFilterKey = `${keyword}\u0000${sortKey}\u0000${sortDirection}`
  const visibleFoods = filteredFoods.slice(
    0,
    foodPage.key === foodFilterKey ? foodPage.count : LIBRARY_PAGE_SIZE,
  )
  const visibleMeals = filteredMeals.slice(
    0,
    mealPage.key === mealFilterKey ? mealPage.count : LIBRARY_PAGE_SIZE,
  )

  const mergeList = useMemo(() => sortFoodCatalog(
    (foods ?? []).filter(
      (food) => food.id !== merging?.id && food.name.toLowerCase().includes(mergeKeyword),
    ),
    'name',
    'asc',
  ), [foods, merging?.id, mergeKeyword])
  const mergeTarget = mergeTargetId
    ? (foods ?? []).find((food) => food.id === mergeTargetId) ?? null
    : null

  /** 当前页签里能选中的全部 id，批量工具条要用来全选 / 反选 */
  const selectableIds =
    tab === 'foods' ? (foods ?? []).map((food) => food.id) : (meals ?? []).map((meal) => meal.id)
  const batchUnit = t(tab === 'foods' ? 'foods.unitFood' : 'foods.unitMeal')
  const tabEmpty = tab === 'foods' ? (foods ?? []).length === 0 : (meals ?? []).length === 0
  const foodById = useMemo(() => new Map((foods ?? []).map((food) => [food.id, food])), [foods])

  return (
    <PageShell
      wide
      title={t('foods.title')}
      description={t('foods.description')}
      backTo="/health"
      backLabel={t('nav.health')}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/health/foods/trash" className={OUTLINE_BUTTON}>
            <Icon name="trash" />
            {t('foods.trash')}
          </Link>
          <button type="button" onClick={() => setReceiving(true)} className={OUTLINE_BUTTON}>
            <Icon name="scan" />
            {t('share.receive')}
          </button>
          {!batch.active && (
            <>
              {tab === 'foods' ? (
                <button type="button" onClick={openCreate} className={SOLID_BUTTON}>
                  <Icon name="plus" />
                  {t('foods.add')}
                </button>
              ) : (
                <button type="button" onClick={openCreateMeal} className={SOLID_BUTTON}>
                  <Icon name="plus" />
                  {t('foods.addMeal')}
                </button>
              )}
              <button
                type="button"
                onClick={() => batch.enter()}
                disabled={tabEmpty}
                className={`${OUTLINE_BUTTON} disabled:opacity-40`}
              >
                <Icon name="list" />
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

      {!tabEmpty && !batch.active && (
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('foods.search')}
            aria-label={t('foods.search')}
            className={INPUT}
          />
          <FoodSortControls
            sortKey={sortKey}
            direction={sortDirection}
            onSortKeyChange={setSortKey}
            onDirectionToggle={() =>
              setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
            }
          />
        </div>
      )}

      {tab === 'foods' && sortedFoods.length > 0 && !batch.active && (
        <div role="group" aria-label={t('foods.filterTags')} className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {[
            { value: null, label: t('foods.filterAll') },
            { value: '', label: t('foods.filterUntagged') },
            ...foodTags.map((tag) => ({ value: tag, label: tag })),
          ].map((item) => {
            const active = tagFilter === item.value
            return (
              <button
                key={item.value === null ? 'filter:all' : item.value === '' ? 'filter:untagged' : `tag:${item.value}`}
                type="button"
                aria-pressed={active}
                onClick={() => setTagFilter(item.value)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-surface text-muted hover:text-fg'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}

      {tab === 'foods' &&
        (foods === undefined ? null : foods.length === 0 ? (
          <EmptyState icon="🍎" text={t('foods.empty')} />
        ) : visibleFoods.length === 0 ? (
          <EmptyState icon="🔍" text={t('foods.searchEmpty')} />
        ) : (
          <>
          <ul className="m-0 list-none space-y-2 p-0">
            {visibleFoods.map((food) => {
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
                  <FoodPhotoThumbnail
                    kind="food"
                    id={food.id}
                    hasPhoto={food.hasPhoto}
                    refreshKey={food.updatedAt}
                    className="h-11 w-11 rounded-lg border border-line"
                    wrapperClassName="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={batch.active}
                      onClick={() => void openFoodInfo(food)}
                      aria-label={food.name}
                      className="w-full rounded-lg text-left transition-colors hover:text-brand disabled:cursor-default"
                    >
                      <p className="m-0 flex items-baseline gap-2 text-sm text-fg">
                        <span className="truncate">{food.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">{food.code}</span>
                      </p>
                      <p className="m-0 mt-0.5 text-xs text-muted">
                        {formatNum(food.kcal)} kcal / 100g · {t('foods.protein')} {formatNum(food.protein)} ·{' '}
                        {t('foods.carbs')} {formatNum(food.carbs)} · {t('foods.fat')} {formatNum(food.fat)}
                      </p>
                      {food.servingName && food.servingGrams && (
                        <p className="m-0 mt-0.5 text-xs text-muted">
                          {food.servingName} · {food.servingGrams} g
                        </p>
                      )}
                    </button>
                    {food.tags.length > 0 && (
                      <TagEditor tags={food.tags} onTagClick={setTagFilter} className="mt-1" />
                    )}
                  </div>
                  {!batch.active && (
                    <RowMenu
                      label={t('common.more')}
                      items={[
                          { label: t('foods.edit'), icon: 'edit', onSelect: () => void openEdit(food) },
                          {
                            label: t('foods.copy'),
                            icon: 'copy',
                            onSelect: () => void handleCopy(food),
                          },
                          {
                            label: t('share.action'),
                            icon: 'share',
                            onSelect: () => {
                              void healthFoodById(food.id).then((fullFood) => {
                                if (fullFood) setSharing(buildFoodShare(fullFood))
                              })
                            },
                          },
                          {
                            label: t('foods.merge'),
                            icon: 'refresh',
                            onSelect: () => openMerge(food),
                          },
                          {
                            label: t('foods.delete'),
                            icon: 'trash',
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
          {filteredFoods.length > visibleFoods.length && (
            <button
              type="button"
              onClick={() =>
                setFoodPage((current) => ({
                  key: foodFilterKey,
                  count:
                    (current.key === foodFilterKey ? current.count : LIBRARY_PAGE_SIZE) +
                    LIBRARY_PAGE_SIZE,
                }))
              }
              className={`${OUTLINE_BUTTON} mt-2 w-full justify-center`}
            >
              {t('records.loadMore', { count: filteredFoods.length - visibleFoods.length })}
            </button>
          )}
          </>
        ))}

      {tab === 'meals' &&
        (meals === undefined ? null : meals.length === 0 ? (
          <EmptyState icon="🍱" text={t('foods.mealEmpty')} />
        ) : visibleMeals.length === 0 ? (
          <EmptyState icon="🔍" text={t('foods.searchEmpty')} />
        ) : (
          <>
          <ul className="m-0 list-none space-y-2 p-0">
            {visibleMeals.map((meal) => {
              const totals = mealTotals(meal.items, foods ?? [])
              const hasPhoto =
                meal.hasPhoto || meal.items.some((item) => foodById.get(item.foodId)?.hasPhoto)
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
                  <FoodPhotoThumbnail
                    kind="meal"
                    id={meal.id}
                    hasPhoto={hasPhoto}
                    refreshKey={meal.updatedAt}
                    className="h-11 w-11 rounded-lg border border-line"
                    wrapperClassName="shrink-0"
                  />
                  <button
                    type="button"
                    disabled={batch.active}
                    onClick={() => {
                      void healthMealById(meal.id).then((fullMeal) => {
                        if (fullMeal) setDetailMeal(fullMeal)
                      })
                    }}
                    className="min-w-0 flex-1 rounded text-left transition-colors hover:text-brand disabled:cursor-default"
                  >
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
                  </button>
                  {!batch.active && (
                    <RowMenu
                      label={t('common.more')}
                      items={[
                          { label: t('foods.edit'), icon: 'edit', onSelect: () => void openEditMeal(meal) },
                          {
                            label: t('foods.copy'),
                            icon: 'copy',
                            onSelect: () => void handleCopyMeal(meal),
                          },
                          {
                            label: t('share.action'),
                            icon: 'share',
                            onSelect: () => void shareMeal(meal),
                          },
                          {
                            label: t('foods.delete'),
                            icon: 'trash',
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
          {filteredMeals.length > visibleMeals.length && (
            <button
              type="button"
              onClick={() =>
                setMealPage((current) => ({
                  key: mealFilterKey,
                  count:
                    (current.key === mealFilterKey ? current.count : LIBRARY_PAGE_SIZE) +
                    LIBRARY_PAGE_SIZE,
                }))
              }
              className={`${OUTLINE_BUTTON} mt-2 w-full justify-center`}
            >
              {t('records.loadMore', { count: filteredMeals.length - visibleMeals.length })}
            </button>
          )}
          </>
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
                      {formatNum(food.kcal)} kcal / 100g · {t('foods.protein')} {formatNum(food.protein)} ·{' '}
                      {t('foods.carbs')} {formatNum(food.carbs)} · {t('foods.fat')} {formatNum(food.fat)}
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

      {detailMeal && (
        <MealInfoDialog
          meal={detailMeal}
          foods={foods ?? []}
          onClose={() => setDetailMeal(null)}
        />
      )}

      {sharing && <ShareDialog doc={sharing} onClose={() => setSharing(null)} />}

      {receiving && <ShareReceiveDialog onClose={() => setReceiving(false)} />}
    </PageShell>
  )
}
