/**
 * 记一笔摄入。
 *
 * 一笔 = 若干项食物，所以这里是个三层小流程，全部在同一个 Modal 里换内容层：
 *   1. list   本次摄入：时间、已加的食物列表、增加一项、存为套餐
 *   2. source 增加一份食物：来自食物库 / 新的食物 / 图片分析，选好后调份量
 *   3. picker 食物库选择（食物与套餐混排，带搜索）；newFood 复用食物库的新增表单；image 交给视觉模型
 *
 * 套餐在食物库里只存「食物 id + 克数」，这里选套餐时按份数等比缩放，
 * 展开后可以逐项改克数，也允许替换掉已经删除的成分。
 *
 * 不真的叠三层弹窗：Modal 的焦点陷阱和 Esc 会互相打架，换内容层还多一个「返回」。
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type {
  HealthFood,
  HealthIntake,
  HealthMeal,
  HealthMealItem,
  IntakeComponent,
} from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { newCode, newId } from '@/core/utils/id'
import { formatClock, todayKey } from '@/core/utils/dateKey'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { compressImage } from '@/features/ai/aiVision'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import { takeNativePhoto, usesNativeCamera } from '@/platform/camera'
import { INPUT, INPUT_NARROW, INPUT_NUM } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, OUTLINE_BUTTON, BAR_BUTTON } from '@/shared/ui/buttonStyles'
import ImageViewer from '@/features/diary/ImageViewer'
import HealthEstimateNote from './HealthDisclaimer'
import FoodForm from './FoodForm'
import type { FoodDraft } from './FoodForm'
import MealForm from './MealForm'
import MealParts from './MealParts'
import IntakeAiReview from './IntakeAiReview'
import { dayTargets, foodMacros, formatNum, mealTotals, round2, sumMacros } from './healthMath'
import { analyzeFoodPhoto } from './foodVision'
import { analyzeMealPhrase } from './mealPhrase'
import type { PhraseItem } from './mealPhrase'
import { componentPhoto, mealPhoto } from './mealPhoto'
import PhraseReviewDialog from './PhraseReviewDialog'
import { matchFood, splitPhrase } from './phraseMatch'
import { normalizeFoodName } from './intakeDraft'
import { asDraft } from './intakeDraft'
import type { DraftFood } from './intakeDraft'
import {
  addIntake,
  healthFoods,
  healthMeals,
  healthProfile,
  saveHealthFood,
  saveHealthMeal,
} from './healthRepo'


/** 这一笔里的一项：普通食物，或者一个套餐（成分快照先算好） */
interface DraftItem {
  key: string
  /** 普通食物；套餐这一行为 null */
  food: DraftFood | null
  /** 这一行显示的名字；套餐用套餐名 */
  name: string
  /** 合计克数：套餐是各成分之和 */
  grams: number
  source: 'library' | 'manual'
  /** 来自套餐时记下套餐 id，普通食物为空 */
  mealId: string | null
  /** 套餐成分快照；普通食物为空数组 */
  components: IntakeComponent[]
  /** 口语份量的换算说明，例如「按 1 拳 ≈ 150 g 算」；只在「一句话」里出现 */
  unitNote?: string
}

/** 正在配份量的套餐：foodId 始终保留原 id，食物被删时靠它判断「缺」 */
interface DraftMealPart {
  foodId: string
  name: string
  /** 输入框里的原文，提交时再转数字 */
  grams: string
}

type Step = 'list' | 'source' | 'picker' | 'newFood' | 'newMeal' | 'image' | 'meal' | 'phrase'

/** 加食物的两种入口：标题 + 一行说明，避免两个实心按钮并列时不知道先点哪个 */
const ENTRY_CARD =
  'block w-full rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-brand'

/** 只接受大于 0 的克数；空串和不认识的字都算没填 */
function parseGrams(text: string): number | null {
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}


/** 普通食物取自己的快照，套餐取成分快照 */
function itemMacros(item: DraftItem) {
  if (item.components.length > 0) return sumMacros(item.components)
  return foodMacros(item.food!, item.grams)
}

/**
 * 成分克数的输入框：成分存的是数字，但输入过程中会出现「1.」「」这种中间态，
 * 所以本地留一份原文，只在能解析成正数时才回写；外部值变了（换份量）就跟着同步。
 */
function GramsInput({
  value,
  label,
  onCommit,
}: {
  value: number
  label: string
  onCommit: (grams: number) => void
}) {
  const [text, setText] = useState(String(value))
  const lastValue = useRef(value)

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value
      setText(String(value))
    }
  }, [value])

  return (
    <input
      value={text}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        const grams = Number(next)
        if (Number.isFinite(grams) && grams > 0) {
          lastValue.current = grams
          onCommit(grams)
        }
      }}
      inputMode="decimal"
      aria-label={label}
      className={INPUT_NUM}
    />
  )
}

export default function IntakeDialog({
  dateKey,
  intakes,
  derived,
  onClose,
}: {
  dateKey: string
  /** 当天已经记下的，用来做重复提示 */
  intakes: HealthIntake[]
  /** 推算 TDEE，问 AI 时作为参考线 */
  derived?: number | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const foods = useLiveQuery(() => healthFoods(), [])
  const meals = useLiveQuery(() => healthMeals(), [])
  const profile = useLiveQuery(() => healthProfile(), [])

  const [step, setStep] = useState<Step>('list')
  const [items, setItems] = useState<DraftItem[]>([])
  const [time, setTime] = useState(() => formatClock(Date.now()))

  /** 正在配份量的那一项（普通食物） */
  const [food, setFood] = useState<DraftFood | null>(null)
  const [grams, setGrams] = useState('100')
  const [servings, setServings] = useState('')

  /** 正在配份量的套餐 */
  const [meal, setMeal] = useState<HealthMeal | null>(null)
  const [mealParts, setMealParts] = useState<DraftMealPart[]>([])
  const [mealServings, setMealServings] = useState('1')
  /** 份量输入框上一次有效的份数：手改克数后，份量按钮按「当前值 × 新/旧」缩放 */
  const mealServingsBase = useRef(1)
  /** 「本次摄入」列表里展开逐项改份量的套餐行 */
  const [openMealRows, setOpenMealRows] = useState<string[]>([])
  /** 要替换的成分下标；非空表示 picker 处在替换模式 */
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null)

  /** picker 的搜索与选中 */
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [pickedMealId, setPickedMealId] = useState<string | null>(null)
  /** 点开的食物照片：同时带上可左右翻的图片列表；null 表示关着 */
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null)

  /** image 的进度 */
  const [busy, setBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  /** 先选来源：文件还是相机 */
  const [imageSourceOpen, setImageSourceOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  /** 浏览器端拍照用的 input（带 capture）；原生端走 Capacitor 相机 */
  const cameraRef = useRef<HTMLInputElement>(null)

  /** 正在配份量的这一份，问 AI 看合不合适；进了摄入列表就不再提供入口 */
  const [aiReviewOpen, setAiReviewOpen] = useState(false)

  /** 「一句话记一餐」的原文与进度 */
  const [phrase, setPhrase] = useState('')
  const [phraseBusy, setPhraseBusy] = useState(false)
  const [phraseError, setPhraseError] = useState('')
  /** 一句话解析完、有没命中库的项时挂在这里，核对窗关掉就清空 */
  const [phraseReview, setPhraseReview] = useState<PhraseItem[] | null>(null)

  /** 「存为套餐」的内联表单 */
  const [mealSaveOpen, setMealSaveOpen] = useState(false)
  const [mealSaveName, setMealSaveName] = useState('')

  /** 确定时撞上当天已有同名食物的，先问一句 */
  const [duplicates, setDuplicates] = useState<string[] | null>(null)

  const aiReady = isConfigured(loadAiConfig())
  const keyword = query.trim().toLowerCase()
  const list = (foods ?? []).filter((item) => item.name.toLowerCase().includes(keyword))
  /** 当前搜索结果里带照片的，点缩略图时按这个顺序左右翻 */
  const photoFoods = list.filter((item) => item.photo !== null)
  const mealList = (meals ?? []).filter((item) => item.name.toLowerCase().includes(keyword))
  const picked = (foods ?? []).find((item) => item.id === pickedId) ?? null
  const pickedMeal = (meals ?? []).find((item) => item.id === pickedMealId) ?? null

  // 问 AI 时带上当天已记的量与目标线；过去的日子按当天第一笔的快照
  const dayTotals = sumMacros(intakes)
  const dayTargetValues = dayTargets(intakes, profile, dateKey === todayKey())

  const mealFound = mealParts.map((part) => ({
    part,
    food: (foods ?? []).find((item) => item.id === part.foodId) ?? null,
  }))
  const mealMissing = mealFound.filter((entry) => entry.food === null).length
  const mealPreview = sumMacros(
    mealFound
      .filter((entry) => entry.food !== null)
      .map((entry) => foodMacros(entry.food!, Number(entry.part.grams) || 0)),
  )
  const mealGramsTotal = round2(
    mealFound
      .filter((entry) => entry.food !== null)
      .reduce((total, entry) => total + (Number(entry.part.grams) || 0), 0),
  )

  function resetMeal() {
    setMeal(null)
    setMealParts([])
    setMealServings('1')
    mealServingsBase.current = 1
    setReplaceIndex(null)
  }

  function backToList() {
    setStep('list')
    setFood(null)
    setAiReviewOpen(false)
    setQuery('')
    setPickedId(null)
    setPickedMealId(null)
    setImageError('')
    setPhraseError('')
    resetMeal()
  }

  /** 进「增加一份食物」，三个来源按钮都是从这里出发 */
  function openSource() {
    setFood(null)
    setAiReviewOpen(false)
    setGrams('100')
    setServings('')
    setQuery('')
    setPickedId(null)
    setPickedMealId(null)
    setImageError('')
    resetMeal()
    setStep('source')
  }

  /** 返回上一层：套餐层回来源层，替换模式回套餐层 */
  function stepBack() {
    if (step === 'source') {
      backToList()
      return
    }
    if (step === 'meal') {
      resetMeal()
      setStep('source')
      return
    }
    if (step === 'picker' && replaceIndex !== null) {
      setReplaceIndex(null)
      setPickedId(null)
      setQuery('')
      setStep('meal')
      return
    }
    if (step === 'phrase') {
      backToList()
      return
    }
    setStep('source')
  }

  /** 选定一条食物库的菜，带出它自己的常用份量 */
  function chooseLibrary(item: HealthFood) {
    setFood(asDraft(item))
    setAiReviewOpen(false)
    setGrams(item.servingGrams ? String(item.servingGrams) : '100')
    setServings(item.servingGrams ? '1' : '')
    setStep('source')
  }

  /** 选定一个套餐：默认 1 份，展开成分可以逐项改 */
  function chooseMeal(item: HealthMeal) {
    setMeal(item)
    setMealParts(
      item.items.map((part) => ({
        foodId: part.foodId,
        name: (foods ?? []).find((each) => each.id === part.foodId)?.name ?? '',
        grams: String(part.grams),
      })),
    )
    setMealServings('1')
    mealServingsBase.current = 1
    setStep('meal')
  }

  function onServings(text: string) {
    setServings(text)
    const count = Number(text)
    if (food?.servingGrams && Number.isFinite(count) && count > 0) {
      setGrams(String(round2(count * food.servingGrams)))
    }
  }

  function onGrams(text: string) {
    setGrams(text)
    const value = Number(text)
    if (food?.servingGrams && Number.isFinite(value) && value >= 0) {
      setServings(String(Math.round((value / food.servingGrams) * 100) / 100))
    }
  }

  /**
   * 套餐按份数缩放：在「当前」克数上等比放大/缩小，手改过的那一项会跟着保留比例。
   * 份量框清空或写坏时不动；上一次有效的份数记在 mealServingsBase，避免重复点同一档时反复乘。
   */
  function onMealServings(text: string) {
    setMealServings(text)
    const count = Number(text)
    if (!Number.isFinite(count) || count <= 0) return
    const base = mealServingsBase.current
    if (count === base) return
    const factor = count / base
    mealServingsBase.current = count
    setMealParts((current) =>
      current.map((part) => ({
        ...part,
        grams: String(round2((Number(part.grams) || 0) * factor)),
      })),
    )
  }

  function onMealPartGrams(index: number, text: string) {
    setMealParts((current) =>
      current.map((part, each) => (each === index ? { ...part, grams: text } : part)),
    )
  }

  /** 「本次摄入」里展开/收起一个套餐，展开后逐项改克数 */
  function toggleMealRow(key: string) {
    setOpenMealRows((current) =>
      current.includes(key) ? current.filter((each) => each !== key) : [...current, key],
    )
  }

  /**
   * 列表里改某一项套餐的成分克数：这一笔存的是快照，所以按原比例折算营养，
   * 不回头读食物库（历史记录不随改食物库而变）。合计克数一并更新。
   */
  function updateComponent(itemKey: string, index: number, grams: number) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== itemKey) return item
        const components = item.components.map((part, each) => {
          if (each !== index) return part
          const ratio = part.grams > 0 ? grams / part.grams : 0
          return {
            ...part,
            grams,
            kcal: round2(part.kcal * ratio),
            protein: round2(part.protein * ratio),
            carbs: round2(part.carbs * ratio),
            fat: round2(part.fat * ratio),
          }
        })
        return {
          ...item,
          components,
          grams: round2(components.reduce((total, part) => total + part.grams, 0)),
        }
      }),
    )
  }

  /** 替换掉一项已经删除的成分，克数保持原样 */
  function replacePart(item: HealthFood) {
    if (replaceIndex === null) return
    setMealParts((current) =>
      current.map((part, index) =>
        index === replaceIndex
          ? { foodId: item.id, name: item.name, grams: part.grams }
          : part,
      ),
    )
    setReplaceIndex(null)
    setPickedId(null)
    setQuery('')
    setStep('meal')
  }

  /** 「确定本项」：把当前食物和克数放进这一笔 */
  function confirmItem() {
    if (!food) return
    const amount = parseGrams(grams)
    if (amount === null) {
      showToast({ message: t('intake.gramsInvalid') })
      return
    }
    setItems((current) => [
      ...current,
      {
        key: newId(),
        food,
        name: food.name,
        grams: amount,
        source: food.foodId ? 'library' : 'manual',
        mealId: null,
        components: [],
      },
    ])
    backToList()
  }

  /** 套餐整份加进这一笔：成分先算成快照，之后改食物库不影响这一笔 */
  function confirmMeal() {
    if (!meal) return
    if (mealParts.length === 0) {
      showToast({ message: t('intake.mealEmpty') })
      return
    }
    if (mealMissing > 0) {
      showToast({ message: t('intake.mealMissingBlocked', { n: mealMissing }) })
      return
    }
    const components: IntakeComponent[] = []
    for (const entry of mealFound) {
      const amount = parseGrams(entry.part.grams)
      if (amount === null) {
        showToast({ message: t('intake.gramsInvalid') })
        return
      }
      components.push({
        foodId: entry.food!.id,
        name: entry.food!.name,
        grams: amount,
        ...foodMacros(entry.food!, amount),
      })
    }
    const totalGrams = round2(components.reduce((total, part) => total + part.grams, 0))
    setItems((current) => [
      ...current,
      {
        key: newId(),
        food: null,
        name: meal.name,
        grams: totalGrams,
        source: 'library',
        mealId: meal.id,
        components,
      },
    ])
    backToList()
  }

  /** 新增食物：先入库，再回到 picker 让它处于已选状态 */
  async function saveNewFood(draft: FoodDraft) {
    const duplicatedFood = (foods ?? []).some(
      (item) => item.name.toLowerCase() === draft.name.toLowerCase(),
    )
    if (duplicatedFood) {
      showToast({ message: t('foods.duplicate') })
      return
    }
    const now = Date.now()
    const saved = await saveHealthFood({
      id: newId(),
      code: newCode(),
      ...draft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    setPickedId(saved.id)
    setPickedMealId(null)
    setQuery('')
    setStep('picker')
  }

  /** 套餐表单里 AI 拆出库里没有的食物：直接入库 */
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

  /** 「新的套餐」：跟食物库同一套表单，存好后直接进这一餐的份量页 */
  async function saveNewMeal(draft: { name: string; items: HealthMealItem[] }) {
    const duplicated = (meals ?? []).some(
      (item) => item.name.toLowerCase() === draft.name.toLowerCase(),
    )
    if (duplicated) {
      showToast({ message: t('foods.mealDuplicate') })
      return
    }
    const now = Date.now()
    const created: HealthMeal = {
      id: newId(),
      name: draft.name,
      items: draft.items,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await saveHealthMeal(created)
    chooseMeal(created)
  }

  /** 口语份量的换算说明，例如「按 1 拳 ≈ 150 g 算」；直接说克或毫升就不写 */
  function unitNoteOf(item: { unit: string; count: number }, grams: number): string | undefined {
    if (['克', '毫升', 'g', 'ml'].includes(item.unit.toLowerCase())) return undefined
    return t('intake.phraseUnitNote', {
      count: item.count,
      unit: item.unit || t('intake.phraseUnitFallback'),
      grams,
    })
  }

  /** 一句话拆出来的一项：命中食物库的直接用库里的名字和数值，没命中的当临时食物 */
  function phraseToItem(entry: PhraseItem): DraftItem {
    const existing = matchFood(entry.name, foods ?? [])
    const base: DraftFood = existing
      ? asDraft(existing)
      : {
          foodId: null,
          name: entry.name,
          kcal: entry.kcal,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          servingName: null,
          servingGrams: null,
          photo: null,
        }
    return {
      key: newId(),
      food: base,
      name: base.name,
      grams: entry.grams,
      source: existing ? 'library' : 'manual',
      mealId: null,
      components: [],
      unitNote: unitNoteOf(entry, entry.grams),
    }
  }

  /** 一句话 → 多项食物：命中库的直接记入，没命中的开核对窗逐条处理 */
  async function parsePhrase() {
    const text = phrase.trim()
    if (text === '') {
      showToast({ message: t('intake.phraseEmpty') })
      return
    }
    setPhraseBusy(true)
    setPhraseError('')
    try {
      const result = await analyzeMealPhrase(loadAiConfig(), text, foods ?? [])
      if (!result.ok || result.items.length === 0) {
        setPhraseError(result.error || t('intake.phraseFailed'))
        return
      }
      const { hits, misses } = splitPhrase(result.items, foods ?? [])
      if (hits.length > 0) {
        setItems((current) => [...current, ...hits.map(phraseToItem)])
      }
      setPhrase('')
      if (misses.length === 0) {
        showToast({ message: t('intake.phraseAdded', { n: hits.length }) })
        backToList()
        return
      }
      // 先回列表再开核对窗：核对完关掉窗口，已经记入的项就在眼前
      backToList()
      setPhraseReview(misses)
      if (hits.length > 0) {
        showToast({ message: t('intake.phrasePartial', { hit: hits.length, miss: misses.length }) })
      }
    } catch (error) {
      setPhraseError((error as Error).message || t('intake.phraseFailed'))
    } finally {
      setPhraseBusy(false)
    }
  }

  /** 核对窗里确认了一项：立即建库（同名复用）并记进这一笔 */
  async function logReviewedItem(item: PhraseItem, draft: FoodDraft, grams: number) {
    const food = await ensureFood(draft)
    setItems((current) => [
      ...current,
      {
        key: newId(),
        food,
        name: food.name,
        grams,
        source: 'library',
        mealId: null,
        components: [],
        unitNote: unitNoteOf(item, grams),
      },
    ])
  }

  async function analyze(file: File) {
    setBusy(true)
    setImageError('')
    try {
      const dataUrl = await compressImage(file)
      const result = await analyzeFoodPhoto(
        loadAiConfig(),
        dataUrl,
        (foods ?? []).map((item) => item.name),
      )
      if (!result.ok || !result.guess) {
        setImageError(result.error || t('intake.aiFailed'))
        return
      }
      const guess = result.guess
      // 模型说「这个食物库里有」，就直接按已有的一样选好
      const existing = guess.matched
        ? (foods ?? []).find((item) => item.name.toLowerCase() === guess.matched.toLowerCase())
        : undefined
      if (existing) {
        chooseLibrary(existing)
        setGrams(String(guess.grams))
        return
      }
      setFood({
        foodId: null,
        name: guess.name,
        kcal: guess.kcal,
        protein: guess.protein,
        carbs: guess.carbs,
        fat: guess.fat,
        servingName: guess.servingName,
        servingGrams: guess.servingGrams,
        photo: null,
      })
      setGrams(String(guess.grams))
      setServings(guess.servingGrams ? '1' : '')
      setStep('source')
    } catch (error) {
      setImageError((error as Error).message || t('intake.aiFailed'))
    } finally {
      setBusy(false)
    }
  }

  /** 拍照：原生端直接调系统相机，浏览器端用带 capture 的 input */
  async function takePhoto() {
    if (!usesNativeCamera()) {
      cameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    if (shot) void analyze(shot)
  }

  /** 同名就复用库里的那条，没有才落库；一句话核对与 AI 估值都走这里 */
  async function ensureFood(draft: FoodDraft): Promise<DraftFood> {
    const name = draft.name.trim()
    const existing = (foods ?? []).find(
      (item) => normalizeFoodName(item.name) === normalizeFoodName(name),
    )
    if (existing) return asDraft(existing)
    // eslint-disable-next-line react-hooks/purity -- 在提交回调里取时间，不在渲染期
    const now = Date.now()
    const created = await saveHealthFood({
      id: newId(),
      code: newCode(),
      ...draft,
      name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    return asDraft(created)
  }

  /** AI 估的临时食物：核对完再入库，同名就复用已有的那条 */
  async function saveAdhoc(draft: FoodDraft) {
    const amount = parseGrams(grams)
    if (amount === null) {
      showToast({ message: t('intake.gramsInvalid') })
      return
    }
    const saved = await ensureFood(draft)
    setItems((current) => [
      ...current,
      {
        key: newId(),
        food: saved,
        name: saved.name,
        grams: amount,
        source: 'manual',
        mealId: null,
        components: [],
      },
    ])
    backToList()
  }

  /** 把这一笔的组合存成一个套餐；套餐里套套餐时摊平成成分 */
  async function saveCurrentAsMeal() {
    const name = mealSaveName.trim()
    if (name === '') {
      showToast({ message: t('intake.mealNameRequired') })
      return
    }
    const recipe: HealthMealItem[] = []
    for (const item of items) {
      if (item.components.length > 0) {
        for (const part of item.components) {
          if (part.foodId) recipe.push({ foodId: part.foodId, grams: part.grams })
        }
      } else if (item.food?.foodId) {
        recipe.push({ foodId: item.food.foodId, grams: item.grams })
      }
    }
    if (recipe.length === 0) {
      showToast({ message: t('intake.storeAsMealEmpty') })
      return
    }
    const duplicatedMeal = (meals ?? []).some(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicatedMeal) {
      showToast({ message: t('intake.storeAsMealDuplicate') })
      return
    }
    const now = Date.now()
    await saveHealthMeal({
      id: newId(),
      name,
      items: recipe,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    setMealSaveOpen(false)
    setMealSaveName('')
    showToast({ message: t('intake.storeAsMealSaved') })
  }

  /** 落库：同一笔的几项共用时间，各存一条 */
  async function commit() {
    if (items.length === 0) {
      showToast({ message: t('intake.emptyList') })
      return
    }
    const now = Date.now()
    // 当天第一笔定下这天的目标线，后面补记沿用同一套数值
    const targets = dayTargets(intakes, profile)
    for (const item of items) {
      const macros = itemMacros(item)
      await addIntake({
        id: newId(),
        code: newCode(),
        dateKey,
        time,
        foodId: item.food?.foodId ?? null,
        name: item.name,
        grams: item.grams,
        ...macros,
        source: item.source,
        mealId: item.mealId,
        components: item.components.length > 0 ? item.components : null,
        tdeeSnapshot: targets.tdee,
        targetKcalSnapshot: targets.targetKcal,
        proteinTargetSnapshot: targets.proteinTarget,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    }
    showToast({ message: t('intake.saved') })
    onClose()
  }

  /** 提交前统一查一遍今天有没有同名，别在加第三项时打断用户 */
  function submit() {
    if (items.length === 0) {
      showToast({ message: t('intake.emptyList') })
      return
    }
    const names = new Set(intakes.map((item) => item.name.trim().toLowerCase()))
    const hits = items
      .map((item) => item.name)
      .filter((name) => names.has(name.trim().toLowerCase()))
    if (hits.length > 0) {
      setDuplicates(hits)
      return
    }
    void commit()
  }

  const backLabel = step === 'list' ? t('intake.title') : t('intake.addItem')
  const pickingReplacement = replaceIndex !== null

  return (
    <>
      <Modal
        size="lg"
        label={t('intake.title')}
        // 灯箱开着时，Esc / 安卓返回先关灯箱，别一步把整个记账弹窗关掉
        onClose={lightbox ? () => setLightbox(null) : onClose}
        resetKey={step}
      >
        <div className="flex items-center gap-2">
          {step !== 'list' && (
            <button
              type="button"
              onClick={stepBack}
              className="shrink-0 rounded-lg px-1 text-sm text-muted transition-colors hover:text-fg"
              aria-label={t('intake.back')}
            >
              ←
            </button>
          )}
          <h2 className="m-0 text-base font-medium text-fg">
            {step === 'list' && t('intake.title')}
            {step === 'source' && t('intake.addItem')}
            {step === 'picker' &&
              (pickingReplacement
                ? t('intake.mealReplaceTitle', {
                    name: mealParts[replaceIndex]?.name ?? '',
                  })
                : t('intake.fromLibrary'))}
            {step === 'newFood' && t('intake.newFood')}
            {step === 'newMeal' && t('intake.newMeal')}
            {step === 'image' && t('intake.fromImage')}
            {step === 'phrase' && t('intake.phraseTitle')}
            {step === 'meal' && (meal?.name ?? t('intake.mealTag'))}
          </h2>
          <span className="sr-only">{backLabel}</span>
        </div>

        {/* 第 1 层：这一笔都有什么 */}
        {step === 'list' && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted">{t('intake.time')}</span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={INPUT_NARROW}
              />
            </label>

            {/* 两种加法和底部的「确定」抢主次，所以都做成带说明的选项卡片 */}
            <div className="space-y-2">
              <button type="button" onClick={openSource} className={ENTRY_CARD}>
                <span className="block text-sm text-fg">{t('intake.addItem')}</span>
                <span className="mt-0.5 block text-xs text-muted">{t('intake.addItemHint')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhraseError('')
                  setStep('phrase')
                }}
                className={ENTRY_CARD}
              >
                <span className="block text-sm text-fg">{t('intake.fromPhrase')}</span>
                <span className="mt-0.5 block text-xs text-muted">{t('intake.fromPhraseHint')}</span>
              </button>
            </div>

            {items.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                {t('intake.itemEmpty')}
              </p>
            ) : (
              // 已选列表单独铺一层底色：上面的入口是描边卡片，这里再同色就分不开
              <div className="rounded-xl border border-line bg-surface-2 p-2">
                <p className="m-0 px-1 pb-1 text-xs font-medium text-fg">
                  {t('intake.selectedItems', { n: items.length })}
                </p>
                <ul className="m-0 list-none space-y-1 p-0">
                {items.map((item) => {
                  const macros = itemMacros(item)
                  const photo =
                    item.food?.photo ??
                    (item.components.length > 0 ? componentPhoto(item.components, foods ?? []) : null)
                  return (
                    <li
                      key={item.key}
                      className="flex items-start gap-2 rounded-lg border border-line/70 bg-surface px-2 py-2"
                    >
                      {photo && (
                        <img
                          src={photo}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-10 shrink-0 rounded-md border border-line/60 object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{item.name}</span>
                        <span className="block text-xs text-muted">
                          {t('intake.itemMeta', {
                            grams: item.grams,
                            kcal: macros.kcal,
                            protein: macros.protein,
                          })}
                        </span>
                        {item.unitNote && (
                          <span className="block text-[11px] text-muted">{item.unitNote}</span>
                        )}
                        {item.components.length > 0 && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => toggleMealRow(item.key)}
                              className="rounded text-[11px] text-brand transition-colors hover:opacity-80"
                            >
                              {openMealRows.includes(item.key)
                                ? t('intake.partsDone')
                                : t('intake.partsEdit')}
                            </button>
                            {openMealRows.includes(item.key) ? (
                              <ul className="m-0 mt-1 list-none space-y-1 p-0">
                                {item.components.map((part, index) => (
                                  <li
                                    key={`${item.key}-${index}`}
                                    className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1"
                                  >
                                    <span className="min-w-0 flex-1 truncate text-xs text-fg">
                                      {part.name}
                                    </span>
                                    <GramsInput
                                      value={part.grams}
                                      label={t('intake.mealGrams')}
                                      onCommit={(grams) =>
                                        updateComponent(item.key, index, grams)
                                      }
                                    />
                                    <span className="shrink-0 text-xs text-muted">g</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <MealParts
                                label={t('intake.partsLabel', { n: item.components.length })}
                                parts={item.components.map((part) => ({
                                  name: part.name,
                                  grams: part.grams,
                                  kcal: part.kcal,
                                  protein: part.protein,
                                }))}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setItems((current) => current.filter((each) => each.key !== item.key))
                        }
                        aria-label={t('common.delete')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
                </ul>
              </div>
            )}

            {items.length > 0 && <HealthEstimateNote />}

            {items.length > 0 && !mealSaveOpen && (
              <button
                type="button"
                onClick={() => {
                  setMealSaveName('')
                  setMealSaveOpen(true)
                }}
                className={`${OUTLINE_BUTTON} w-full`}
              >
                {t('intake.storeAsMeal')}
              </button>
            )}

            {mealSaveOpen && (
              <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                <p className="m-0 text-sm text-fg">{t('intake.storeAsMealTitle')}</p>
                <input
                  value={mealSaveName}
                  onChange={(event) => setMealSaveName(event.target.value)}
                  placeholder={t('intake.storeAsMealPlaceholder')}
                  className={INPUT}
                />
                <p className="m-0 text-xs text-muted">{t('intake.storeAsMealHint')}</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMealSaveOpen(false)}
                    className={OUTLINE_BUTTON}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCurrentAsMeal()}
                    className={SOLID_BUTTON}
                  >
                    {t('foods.mealSave')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={OUTLINE_BUTTON}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={submit} className={SOLID_BUTTON}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        )}

        {/* 第 2 层：加一份食物 */}
        {step === 'source' && (
          <div className="mt-3 space-y-3">
            {/* 四个来源排两行，一行两个 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: t('intake.fromLibrary'),
                  onClick: () => {
                    setQuery('')
                    setPickedId(null)
                    setPickedMealId(null)
                    setReplaceIndex(null)
                    setStep('picker')
                  },
                },
                { label: t('intake.newFood'), onClick: () => setStep('newFood') },
                { label: t('intake.fromImage'), onClick: () => setStep('image') },
                { label: t('intake.newMeal'), onClick: () => setStep('newMeal') },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={option.onClick}
                  className={`${OUTLINE_BUTTON} w-full px-2 py-2 text-xs leading-snug`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {!food && (
              <p className="m-0 text-center text-xs text-muted">{t('intake.pickFood')}</p>
            )}

            {/* 食物库里选的：只调这一份的多少 */}
            {food && food.foodId && (
              <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-fg">{food.name}</span>
                  <span className="text-xs text-muted">
                    {t('intake.per100', { kcal: formatNum(food.kcal) })}
                  </span>
                </div>

                {food.servingGrams && (
                  <div className="flex flex-wrap items-center gap-1">
                    {food.servingName && (
                      <span className="mr-1 text-xs text-muted">
                        {t('intake.servingOf', { name: food.servingName, grams: food.servingGrams })}
                      </span>
                    )}
                    {[0.5, 1, 1.5, 2].map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => {
                          setServings(String(ratio))
                          setGrams(String(round2(food.servingGrams! * ratio)))
                        }}
                        className={BAR_BUTTON}
                      >
                        {t('intake.portion', { n: ratio })}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {food.servingGrams && (
                    <label className="block">
                      <span className="text-xs text-muted">{t('intake.servings')}</span>
                      <input
                        value={servings}
                        onChange={(event) => onServings(event.target.value)}
                        inputMode="decimal"
                        className={`${INPUT} mt-1`}
                      />
                    </label>
                  )}
                  <label className={food.servingGrams ? 'block' : 'col-span-2 block'}>
                    <span className="text-xs text-muted">{t('intake.grams')}</span>
                    <input
                      value={grams}
                      onChange={(event) => onGrams(event.target.value)}
                      inputMode="decimal"
                      className={`${INPUT} mt-1`}
                    />
                  </label>
                </div>

                <p className="m-0 text-xs text-fg">
                  {t('intake.preview', {
                    kcal: foodMacros(food, Number(grams) || 0).kcal,
                    protein: foodMacros(food, Number(grams) || 0).protein,
                  })}
                </p>
                <HealthEstimateNote />

                {!aiReviewOpen && (
                  <button
                    type="button"
                    onClick={() => setAiReviewOpen(true)}
                    className={`${OUTLINE_BUTTON} w-full`}
                  >
                    {t('health.askAi')}
                  </button>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={openSource} className={OUTLINE_BUTTON}>
                    {t('intake.cancelAdd')}
                  </button>
                  <button type="button" onClick={confirmItem} className={SOLID_BUTTON}>
                    {t('intake.confirmItem')}
                  </button>
                </div>
              </div>
            )}

            {/* AI 估的临时食物：参数可改，确定时才入库 */}
            {food && !food.foodId && (
              <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                <p className="m-0 text-xs text-warning">{t('intake.aiHint')}</p>
                <label className="block">
                  <span className="text-xs text-muted">{t('intake.grams')}</span>
                  <input
                    value={grams}
                    onChange={(event) => setGrams(event.target.value)}
                    inputMode="decimal"
                    className={`${INPUT} mt-1`}
                  />
                </label>
                <p className="m-0 text-xs text-fg">
                  {t('intake.preview', {
                    kcal: foodMacros(food, Number(grams) || 0).kcal,
                    protein: foodMacros(food, Number(grams) || 0).protein,
                  })}
                </p>
                <HealthEstimateNote />
                {!aiReviewOpen && (
                  <button
                    type="button"
                    onClick={() => setAiReviewOpen(true)}
                    className={`${OUTLINE_BUTTON} w-full`}
                  >
                    {t('health.askAi')}
                  </button>
                )}
                <FoodForm
                  key={food.name}
                  initial={food}
                  submitLabel={t('intake.confirmItem')}
                  onSubmit={(draft) => void saveAdhoc(draft)}
                />
                <button type="button" onClick={openSource} className={`${OUTLINE_BUTTON} w-full`}>
                  {t('intake.cancelAdd')}
                </button>
              </div>
            )}

            {food && aiReviewOpen && (
              <IntakeAiReview
                key={food.name}
                onClose={() => setAiReviewOpen(false)}
                dayKey={dateKey}
                intakes={intakes}
                totals={dayTotals}
                targets={dayTargetValues}
                derived={derived}
                profile={profile}
                candidate={{
                  name: food.name,
                  grams: Number(grams) || 0,
                  ...foodMacros(food, Number(grams) || 0),
                }}
              />
            )}
          </div>
        )}

        {/* 第 3 层 d：一句话记一餐 */}
        {step === 'phrase' && (
          <div className="mt-3 space-y-3">
            {!aiReady ? (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-center">
                <p className="m-0 text-sm text-fg">{t('intake.aiNotConfigured')}</p>
                <Link
                  to="/me/agent/ai"
                  onClick={onClose}
                  className={`${SOLID_BUTTON} mt-3 inline-flex`}
                >
                  {t('intake.goSettings')}
                </Link>
              </div>
            ) : (
              <>
                <p className="m-0 text-xs text-muted">{t('intake.phraseHint')}</p>
                <textarea
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder={t('intake.phrasePlaceholder')}
                  rows={3}
                  className={`${INPUT} resize-y`}
                  disabled={phraseBusy}
                />
                {phraseError !== '' && <ErrorNote>{phraseError}</ErrorNote>}
                <button
                  type="button"
                  onClick={() => void parsePhrase()}
                  disabled={phraseBusy || phrase.trim() === ''}
                  className={`${SOLID_BUTTON} w-full`}
                >
                  {phraseBusy ? t('intake.phraseBusy') : t('intake.phraseAdd')}
                </button>
              </>
            )}
          </div>
        )}

        {/* 第 3 层 a：从食物库里挑（食物与套餐混排） */}
        {step === 'picker' && (
          <div className="mt-3 space-y-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('intake.search')}
              className={INPUT}
            />

            {!pickingReplacement && mealList.length > 0 && (
              <div>
                <p className="m-0 mb-1 text-xs text-muted">{t('intake.mealTag')}</p>
                <ul className="m-0 max-h-40 list-none space-y-1 overflow-y-auto p-0">
                  {mealList.map((item) => {
                    const totals = mealTotals(item.items, foods ?? [])
                    const photo = mealPhoto(item, foods ?? [])
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPickedMealId(item.id)
                            setPickedId(null)
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                            pickedMealId === item.id ? 'border-brand' : 'border-line hover:border-brand/50'
                          }`}
                        >
                          {photo && (
                            <img
                              src={photo}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                                {item.name}
                              </span>
                              <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">
                                {t('intake.mealTag')}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {t('intake.mealItemCount', { n: totals.count, kcal: totals.kcal })}
                              {totals.missing > 0 && (
                                <span className="ml-2 text-danger">
                                  {t('intake.mealMissing', { n: totals.missing })}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {!pickingReplacement && mealList.length > 0 && (
              <p className="m-0 text-xs text-muted">{t('foods.tabFoods')}</p>
            )}

            {foods === undefined ? null : list.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {(foods ?? []).length === 0 ? t('intake.foodEmpty') : t('intake.noMatch')}
              </p>
            ) : (
              <ul className="m-0 max-h-56 list-none space-y-1 overflow-y-auto p-0">
                {list.map((item) => (
                  <li key={item.id}>
                    <div
                      className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                        pickedId === item.id ? 'border-brand' : 'border-line hover:border-brand/50'
                      }`}
                    >
                      {item.photo && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({
                              images: photoFoods.map((entry) => entry.photo!),
                              index: photoFoods.findIndex((entry) => entry.id === item.id),
                            })
                          }
                          aria-label={t('imageImport.view')}
                          className="shrink-0 overflow-hidden rounded-md border border-line transition-opacity hover:opacity-80"
                        >
                          <img
                            src={item.photo}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-10 w-10 object-cover"
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPickedId(item.id)
                          setPickedMealId(null)
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm text-fg">{item.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {t('intake.per100', { kcal: formatNum(item.kcal) })}
                          {item.servingName && item.servingGrams
                            ? ` · ${item.servingName} · ${formatNum(item.servingGrams)} g`
                            : ''}
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={stepBack} className={OUTLINE_BUTTON}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={pickingReplacement ? !picked : !picked && !pickedMeal}
                onClick={() => {
                  if (pickingReplacement) {
                    if (picked) replacePart(picked)
                    return
                  }
                  if (pickedMeal) {
                    chooseMeal(pickedMeal)
                    return
                  }
                  if (picked) chooseLibrary(picked)
                }}
                className={`${SOLID_BUTTON} disabled:opacity-40`}
              >
                {pickingReplacement ? t('intake.mealReplace') : t('intake.confirmPick')}
              </button>
            </div>
          </div>
        )}

        {/* 第 3 层 a2：配套餐的份量与成分 */}
        {step === 'meal' && meal && (
          <div className="mt-3 space-y-2">
            <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-fg">{meal.name}</span>
                <span className="text-xs text-muted">
                  {t('foods.mealItemCount', { n: mealParts.length })}
                  {mealMissing > 0 && (
                    <span className="ml-2 text-danger">
                      {t('intake.mealMissing', { n: mealMissing })}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted">{t('intake.mealServings')}</span>
                {[0.5, 1, 1.5, 2].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => onMealServings(String(ratio))}
                    className={BAR_BUTTON}
                  >
                    {t('intake.portion', { n: ratio })}
                  </button>
                ))}
                <input
                  value={mealServings}
                  onChange={(event) => onMealServings(event.target.value)}
                  inputMode="decimal"
                  aria-label={t('intake.mealServings')}
                  className={INPUT_NUM}
                />
              </div>
              <p className="m-0 text-[11px] text-muted">{t('intake.mealServingsHint')}</p>

              <ul className="m-0 list-none space-y-1 p-0">
                {mealFound.map((entry, index) => {
                  const found = entry.food
                  if (!found) {
                    return (
                      <li
                        key={`${entry.part.foodId}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-danger/40 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 text-xs text-danger">
                          {t('intake.mealMissing', { n: 1 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceIndex(index)
                            setPickedId(null)
                            setPickedMealId(null)
                            setQuery('')
                            setStep('picker')
                          }}
                          className={BAR_BUTTON}
                        >
                          {t('intake.mealReplace')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMealParts((current) => current.filter((_, each) => each !== index))
                          }
                          aria-label={t('intake.mealRemovePart')}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  }
                  const macros = foodMacros(found, Number(entry.part.grams) || 0)
                  return (
                    <li
                      key={`${entry.part.foodId}-${index}`}
                      className="rounded-lg border border-line px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        {found.photo && (
                          <button
                            type="button"
                            onClick={() => {
                              const withPhoto = mealFound.filter((each) => each.food?.photo)
                              setLightbox({
                                images: withPhoto.map((each) => each.food!.photo!),
                                index: withPhoto.findIndex(
                                  (each) => each.food!.id === found.id,
                                ),
                              })
                            }}
                            aria-label={t('imageImport.view')}
                            className="shrink-0 overflow-hidden rounded-md border border-line transition-opacity hover:opacity-80"
                          >
                            <img
                              src={found.photo}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-8 w-8 object-cover"
                            />
                          </button>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">
                          {found.name}
                        </span>
                        <input
                          value={entry.part.grams}
                          onChange={(event) => onMealPartGrams(index, event.target.value)}
                          inputMode="decimal"
                          aria-label={t('intake.mealGrams')}
                          className={INPUT_NUM}
                        />
                        <span className="shrink-0 text-xs text-muted">g</span>
                        <button
                          type="button"
                          onClick={() =>
                            setMealParts((current) => current.filter((_, each) => each !== index))
                          }
                          aria-label={t('intake.mealRemovePart')}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                        >
                          ✕
                        </button>
                      </div>
                      <span className="mt-0.5 block text-xs text-muted">
                        {t('intake.preview', {
                          kcal: macros.kcal,
                          protein: macros.protein,
                        })}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <p className="m-0 text-xs text-fg">
                {t('intake.mealPreview', {
                  kcal: mealPreview.kcal,
                  protein: mealPreview.protein,
                  grams: mealGramsTotal,
                })}
              </p>
              <HealthEstimateNote />

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={openSource} className={OUTLINE_BUTTON}>
                  {t('intake.cancelAdd')}
                </button>
                <button type="button" onClick={confirmMeal} className={SOLID_BUTTON}>
                  {t('intake.confirmItem')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 第 3 层 b：新建套餐（跟食物库同一套表单，存好直接进份量页） */}
        {step === 'newMeal' && (
          <div className="mt-3 space-y-2">
            <p className="m-0 text-xs text-muted">{t('intake.newMealHint')}</p>
            <MealForm
              foods={foods ?? []}
              submitLabel={t('foods.mealSave')}
              onSubmit={(draft) => void saveNewMeal(draft)}
              onCancel={() => setStep('source')}
              onCreateFood={createFoodForMeal}
            />
          </div>
        )}

        {/* 第 3 层 b：新建食物（跟食物库同一套表单，入库后回到选择列表） */}
        {step === 'newFood' && (
          <div className="mt-3 space-y-2">
            <p className="m-0 text-xs text-muted">{t('intake.newHint')}</p>
            <FoodForm
              submitLabel={t('foods.save')}
              onSubmit={(draft) => void saveNewFood(draft)}
            />
          </div>
        )}

        {/* 第 3 层 c：图片分析 */}
        {step === 'image' && (
          <div className="mt-3 space-y-3">
            {!aiReady ? (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-center">
                <p className="m-0 text-sm text-fg">{t('intake.aiNotConfigured')}</p>
                <Link
                  to="/me/agent/ai"
                  onClick={onClose}
                  className={`${SOLID_BUTTON} mt-3 inline-flex`}
                >
                  {t('intake.goSettings')}
                </Link>
              </div>
            ) : (
              <>
                <p className="m-0 text-xs text-muted">{t('intake.imageHint')}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setImageSourceOpen(true)}
                  className={`${SOLID_BUTTON} w-full`}
                >
                  {busy ? t('intake.analyzing') : t('intake.choosePhoto')}
                </button>
                {imageError !== '' && <ErrorNote>{imageError}</ErrorNote>}
              </>
            )}
          </div>
        )}
      </Modal>

      {duplicates && (
        <ConfirmDialog
          tone="brand"
          title={t('intake.duplicateTitle')}
          description={t('intake.duplicateDesc', { names: duplicates.join('、') })}
          confirmLabel={t('intake.addAnyway')}
          onConfirm={() => {
            setDuplicates(null)
            void commit()
          }}
          onCancel={() => setDuplicates(null)}
        />
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void analyze(file)
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
          if (file) void analyze(file)
        }}
      />

      {imageSourceOpen && (
        <ImageSourceDialog
          onPickFile={() => imageInputRef.current?.click()}
          onTakePhoto={() => void takePhoto()}
          onClose={() => setImageSourceOpen(false)}
        />
      )}

      {phraseReview && (
        <PhraseReviewDialog
          items={phraseReview}
          foods={foods ?? []}
          onClose={() => setPhraseReview(null)}
          onLog={(item, draft, grams) => logReviewedItem(item, draft, grams)}
        />
      )}

      {lightbox && (
        <ImageViewer
          images={lightbox.images.map((preview) => ({ preview }))}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox({ images: lightbox.images, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
