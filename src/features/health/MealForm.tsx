/**
 * 套餐表单：名字 + 一组「食物库条目 + 克数」。
 *
 * 不存营养值，保存时只写引用；合计在这里实时算，用的是食物库当前的数据。
 * 被删掉的食物会显示成「已删除的食物」，先删掉这一项才能保存。
 */
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import type { HealthFood, HealthMeal, HealthMealItem } from '@/core/db/schema'
import { newId } from '@/core/utils/id'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { compressImage } from '@/features/ai/aiVision'
import { useI18n } from '@/shared/i18n/context'
import { INPUT, INPUT_NUM } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import { takeNativePhoto, usesNativeCamera } from '@/platform/camera'
import type { FoodDraft } from './FoodForm'
import { analyzeMealPhrase, analyzeMealPhoto } from './mealPhrase'
import type { PhraseItem } from './mealPhrase'
import { foodMacros, mealTotals } from './healthMath'

interface Part {
  key: string
  foodId: string
  /** 输入框里的原始文本，提交时再校验 */
  grams: string
}

function asParts(items: HealthMealItem[]): Part[] {
  return items.map((item) => ({ key: newId(), foodId: item.foodId, grams: String(item.grams) }))
}

export default function MealForm({
  initial,
  foods,
  submitLabel,
  onSubmit,
  onCancel,
  onCreateFood,
}: {
  initial?: HealthMeal
  foods: HealthFood[]
  submitLabel: string
  onSubmit: (draft: { name: string; items: HealthMealItem[] }) => void
  onCancel: () => void
  /** AI 拆出来、食物库里没有的项：入库并返回新食物，没有这个回调就只能加库里的 */
  onCreateFood?: (draft: FoodDraft) => Promise<HealthFood>
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [parts, setParts] = useState<Part[]>(() => asParts(initial?.items ?? []))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  /** 这次表单里 AI 新建的食物：不等 live 查询刷新，先并入可选池 */
  const [extraFoods, setExtraFoods] = useState<HealthFood[]>([])

  /** AI 对话 */
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMounted, setAiMounted] = useState(false)
  const [chat, setChat] = useState<{ role: 'you' | 'ai'; text: string }[]>([])
  const [askText, setAskText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  /** 图片导入 */
  const [photoOpen, setPhotoOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [photoNote, setPhotoNote] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const aiReady = isConfigured(loadAiConfig())

  const allFoods = extraFoods.length === 0 ? foods : [...foods, ...extraFoods]
  const byId = new Map(allFoods.map((food) => [food.id, food]))
  const keyword = query.trim().toLowerCase()
  const matches = allFoods.filter((food) => food.name.toLowerCase().includes(keyword))
  const missing = parts.filter((part) => !byId.has(part.foodId)).length

  const totals = mealTotals(
    parts.map((part) => ({ foodId: part.foodId, grams: Number(part.grams) || 0 })),
    allFoods,
  )

  function addPart(food: HealthFood) {
    setParts((current) => [
      ...current,
      { key: newId(), foodId: food.id, grams: String(food.servingGrams ?? 100) },
    ])
    setQuery('')
  }

  /**
   * AI 拆出来的项 → 套餐组成：库里有的直接用，没有的按估的每 100g 数值建一条食物。
   * 返回真正加进来的项数。
   */
  async function addParsed(items: PhraseItem[]): Promise<number> {
    let pool = allFoods
    const made: Part[] = []
    for (const item of items) {
      const wanted = (item.matched || item.name).toLowerCase()
      let food = pool.find((each) => each.name.toLowerCase() === wanted)
      if (!food && onCreateFood) {
        food = await onCreateFood({
          name: item.name,
          kcal: item.kcal,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          servingName: null,
          servingGrams: null,
        })
        pool = [...pool, food]
        const created = food
        setExtraFoods((current) => [...current, created])
      }
      if (!food) continue
      made.push({ key: newId(), foodId: food.id, grams: String(item.grams) })
    }
    if (made.length > 0) setParts((current) => [...current, ...made])
    return made.length
  }

  function pushChat(role: 'you' | 'ai', text: string) {
    setChat((current) => [...current, { role, text }])
  }

  /** 一句话描述这一餐，AI 拆完直接补进套餐 */
  async function ask() {
    const text = askText.trim()
    if (text === '' || aiBusy) return
    pushChat('you', text)
    setAskText('')
    setAiBusy(true)
    try {
      const result = await analyzeMealPhrase(loadAiConfig(), text, allFoods)
      if (!result.ok) {
        pushChat('ai', result.error || t('foods.mealAiFailed'))
        return
      }
      const added = await addParsed(result.items)
      pushChat('ai', added > 0 ? t('foods.mealAiAdded', { n: added }) : t('foods.mealAiNothing'))
    } catch (failure) {
      pushChat('ai', (failure as Error).message || t('foods.mealAiFailed'))
    } finally {
      setAiBusy(false)
    }
  }

  /** 拍一张这一餐的照片，拆成几项加进来 */
  async function importPhoto(file: File) {
    setPhotoBusy(true)
    setPhotoError('')
    setPhotoNote('')
    try {
      const dataUrl = await compressImage(file)
      const result = await analyzeMealPhoto(loadAiConfig(), dataUrl, allFoods)
      if (!result.ok) {
        setPhotoError(result.error || t('foods.photoFailed'))
        return
      }
      const added = await addParsed(result.items)
      if (added === 0) {
        setPhotoError(t('foods.mealAiNothing'))
        return
      }
      setPhotoNote(t('foods.mealPhotoDone', { n: added }))
    } catch (failure) {
      setPhotoError((failure as Error).message || t('foods.photoFailed'))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function takePhoto() {
    if (!usesNativeCamera()) {
      cameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    if (shot) void importPhoto(shot)
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('foods.mealNameRequired'))
      return
    }
    if (parts.length === 0) {
      setError(t('foods.mealNeedOne'))
      return
    }
    if (missing > 0) {
      setError(t('foods.mealMissingBlocked', { n: missing }))
      return
    }
    const items: HealthMealItem[] = []
    for (const part of parts) {
      const grams = Number(part.grams)
      if (!Number.isFinite(grams) || grams <= 0) {
        setError(t('intake.gramsInvalid'))
        return
      }
      items.push({ foodId: part.foodId, grams })
    }
    setError('')
    onSubmit({ name: trimmed, items })
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-muted">{t('foods.mealName')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('foods.mealNamePlaceholder')}
          className={`${INPUT} mt-1`}
        />
      </label>

      {/* 和新增食物同一套入口：AI 聊、图片导入，结果都直接补进「包含的食物」 */}
      {!aiOpen && (
        <button
          type="button"
          onClick={() => {
            setAiMounted(true)
            setAiOpen(true)
          }}
          className={`${OUTLINE_BUTTON} w-full`}
        >
          {t('foods.mealAiAsk')}
        </button>
      )}
      {aiMounted && (
        <div className={aiOpen ? 'space-y-2 rounded-xl border border-line bg-surface-2 p-3' : 'hidden'}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="m-0 text-sm text-fg">{t('foods.mealAiAsk')}</p>
              <p className="m-0 mt-0.5 text-xs text-muted">{t('foods.mealAiHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
            >
              {t('foods.aiClose')}
            </button>
          </div>

          {!aiReady ? (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
              {t('foods.aiNoConfig')}
              <div className="mt-2">
                <Link to="/me/agent/ai" className="text-brand underline">
                  {t('foods.aiGoSettings')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {chat.length > 0 && (
                <ul className="m-0 max-h-40 list-none space-y-1 overflow-y-auto p-0">
                  {chat.map((each, index) => (
                    <li
                      key={`${each.role}-${index}`}
                      className={`rounded-lg px-2 py-1.5 text-xs ${
                        each.role === 'you' ? 'bg-brand/10 text-fg' : 'text-muted'
                      }`}
                    >
                      {each.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={askText}
                  onChange={(event) => setAskText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void ask()
                    }
                  }}
                  placeholder={t('foods.mealAiPlaceholder')}
                  className={`${INPUT} flex-1`}
                  disabled={aiBusy}
                />
                <button
                  type="button"
                  onClick={() => void ask()}
                  disabled={aiBusy || askText.trim() === ''}
                  className={`${SOLID_BUTTON} shrink-0`}
                >
                  {aiBusy ? t('foods.aiThinking') : t('foods.aiSend')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!photoOpen && (
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          className={`${OUTLINE_BUTTON} w-full`}
        >
          {t('foods.mealPhotoAsk')}
        </button>
      )}
      {photoOpen && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="m-0 text-sm text-fg">{t('foods.mealPhotoTitle')}</p>
              <p className="m-0 mt-0.5 text-xs text-muted">{t('foods.mealPhotoDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setPhotoOpen(false)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
            >
              {t('foods.aiClose')}
            </button>
          </div>

          {!aiReady ? (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
              {t('foods.aiNoConfig')}
              <div className="mt-2">
                <Link to="/me/agent/ai" className="text-brand underline">
                  {t('foods.aiGoSettings')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => setSourceOpen(true)}
                className={`${SOLID_BUTTON} w-full`}
              >
                {photoBusy ? t('foods.photoReading') : t('foods.mealPhotoPick')}
              </button>
              {photoError !== '' && <p className="m-0 text-xs text-danger">{photoError}</p>}
              {photoNote !== '' && <p className="m-0 text-xs text-brand">{photoNote}</p>}
            </>
          )}
        </div>
      )}

      <div>
        <span className="text-xs text-muted">{t('foods.mealParts')}</span>
        {parts.length === 0 ? (
          <p className="mb-0 mt-1 rounded-xl border border-dashed border-line p-3 text-center text-xs text-muted">
            {t('foods.mealPartEmpty')}
          </p>
        ) : (
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {parts.map((part) => {
              const food = byId.get(part.foodId)
              const macros = food ? foodMacros(food, Number(part.grams) || 0) : null
              return (
                <li
                  key={part.key}
                  className="rounded-lg border border-line px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        food ? 'text-fg' : 'text-danger'
                      }`}
                    >
                      {food ? food.name : t('foods.mealUnknownPart')}
                    </span>
                    <input
                      value={part.grams}
                      onChange={(event) =>
                        setParts((current) =>
                          current.map((each) =>
                            each.key === part.key ? { ...each, grams: event.target.value } : each,
                          ),
                        )
                      }
                      inputMode="decimal"
                      aria-label={t('intake.mealGrams')}
                      className={INPUT_NUM}
                    />
                    <span className="shrink-0 text-xs text-muted">g</span>
                    <button
                      type="button"
                      onClick={() =>
                        setParts((current) => current.filter((each) => each.key !== part.key))
                      }
                      aria-label={t('intake.mealRemovePart')}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                  {macros && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {t('intake.preview', {
                        kcal: macros.kcal,
                        protein: macros.protein,
                      })}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <span className="text-xs text-muted">{t('foods.mealAddPart')}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('foods.mealSearch')}
          className={`${INPUT} mt-1`}
        />
        {matches.length === 0 ? (
          <p className="mb-0 mt-1 text-xs text-muted">{t('foods.mealNoMatch')}</p>
        ) : (
          <ul className="m-0 mt-1 max-h-40 list-none space-y-1 overflow-y-auto p-0">
            {matches.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => addPart(food)}
                  className="block w-full rounded-lg border border-line p-2 text-left transition-colors hover:border-brand/50"
                >
                  <span className="block text-sm text-fg">{food.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t('intake.per100', { kcal: Math.round(food.kcal) })}
                    {food.servingName && food.servingGrams
                      ? ` · ${food.servingName} · ${food.servingGrams} g`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="m-0 text-xs text-fg">
        {t('foods.mealTotal', {
          kcal: totals.kcal,
          protein: totals.protein,
          grams: totals.grams,
        })}
        {missing > 0 && (
          <span className="ml-2 text-danger">{t('foods.mealMissing', { n: missing })}</span>
        )}
      </p>

      {error !== '' && <p className="m-0 text-xs text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={submit} className={SOLID_BUTTON}>
          {submitLabel}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importPhoto(file)
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importPhoto(file)
        }}
      />

      {sourceOpen && (
        <ImageSourceDialog
          onPickFile={() => fileRef.current?.click()}
          onTakePhoto={() => void takePhoto()}
          onClose={() => setSourceOpen(false)}
        />
      )}
    </div>
  )
}
