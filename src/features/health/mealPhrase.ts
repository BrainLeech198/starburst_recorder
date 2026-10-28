/**
 * 一句话记一餐：把「一拳米饭 + 一个卤鸡腿 + 0.8 拳花菜」这种口语
 * 拆成几项可以直接记进这一笔的食物。
 *
 * 和 foodVision 一样分两段：这里只说「怎么问」和「怎么解析」，
 * 请求走 aiClient，解析写成纯函数方便单测。
 *
 * 关键的一点是把现有食物库连同每 100g 的数值一起塞给模型：
 * 命中库里的食物就直接查表，不让它另估一遍——这正是「拟 fit」里最不容易飘的部分。
 */
import type { HealthFood } from '@/core/db/schema'
import type { ChatContentPart } from '@/platform/desktop'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import { translate } from '@/shared/i18n/context'

/** 一句话里拆出来的一项 */
export interface PhraseItem {
  name: string
  /** 用户原话里的单位，例如「拳」「个」「克」；没说就是空串 */
  unit: string
  /** 几个单位，例如 0.8 */
  count: number
  /** 换算后的克数 */
  grams: number
  /** 每 100g */
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** 命中食物库时填库里的名字，没命中是空串 */
  matched: string
}

/** 模型偶尔把 JSON 包进代码块，先剥掉 */
function stripFence(text: string) {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

/** 接受 165、"165kcal"、"0.8拳" 这类写法 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const matched = value.replace(',', '.').match(/-?\d+(\.\d+)?/)
  if (!matched) return null
  const parsed = Number(matched[0])
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

/** 食物库压成一行一条的简表，别把上千行都塞进提示词 */
function libraryTable(foods: HealthFood[]) {
  return foods
    .filter((food) => food.name.trim() !== '')
    .slice(0, 120)
    .map((food) => {
      const serving =
        food.servingName && food.servingGrams
          ? `，${food.servingName}≈${food.servingGrams}g`
          : ''
      return `${food.name} ${Math.round(food.kcal)}/${round1(food.protein)}/${round1(food.carbs)}/${round1(food.fat)}${serving}`
    })
    .join('\n')
}

function systemPrompt(foods: HealthFood[]) {
  const table = libraryTable(foods)
  const library = table === '' ? '（空）' : table
  return `你在帮用户把一句话里说的食物，拆成可以记进饮食账的条目。只做两件事：拆项、换算份量。

用户会这样写：「一拳米饭 + 一个卤鸡腿 + 0.8 拳花菜」，有时带时间和地点（17:10、沙县、食堂）。

已有食物库（格式：名称 每100g 热量/蛋白/碳水/脂肪，单位 kcal 和 g）：
${library}

规矩：
1. 用户说到的每一项食物都要单独成条：不合并、不遗漏、不换名字。
2. 命中上面食物库的，必须原样用库里的名字和每 100g 数值，matched 填库里的名字；不许自己另估。
3. 没命中的才自己估：按家常做法，油炸、带皮、红烧往高里估（宁可高估）。
4. 口语份量按下面基准换算成克，同时保留用户原话的单位和数量：
   一拳 米饭/面条 ≈150g；一拳 蔬菜 ≈100g；一拳 红烧肉 ≈130g；一掌 肉 ≈100g；
   一碗 米饭 ≈200g；一杯 ≈250g；一勺 ≈10g；一个鸡蛋 ≈50g；一根火腿肠 ≈35g；
   一片面包 ≈35g；一把坚果 ≈30g；一份按同类常见份量。
5. 用户直接写克数或毫升的，按原数换算（1 ml 约等于 1 g），unit 写「克」或「毫升」。
6. 完全没说份量的，按「一份」估，count 填 1，unit 填「份」。
7. 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白。

格式：
{"items":[{"name":"米饭","matched":"","unit":"拳","count":1,"grams":150,"per100g":{"kcal":116,"protein":2.6,"carbs":25.9,"fat":0.3}}]}`
}

/**
 * 解析模型的回答。认不出任何一项就返回空数组，交给调用方提示重说。
 * 异常值统一夹到合理区间，不让 NaN 流进存储。
 */
export function parseMealPhrase(reply: string): PhraseItem[] {
  const json = stripFence(reply).match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return []
  }

  const rawList = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.foods)
      ? data.foods
      : []

  const items: PhraseItem[] = []
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (name === '') continue

    // 有的模型套一层 per100g，有的直接平铺
    const per =
      record.per100g && typeof record.per100g === 'object'
        ? (record.per100g as Record<string, unknown>)
        : record

    const grams = Math.round(clamp(toNumber(record.grams) ?? 100, 1, 5000))
    const count = round1(clamp(toNumber(record.count) ?? 1, 0.1, 99))
    const unit = typeof record.unit === 'string' ? record.unit.trim() : ''
    const matched = typeof record.matched === 'string' ? record.matched.trim() : ''

    items.push({
      name,
      unit,
      count,
      grams,
      kcal: Math.round(clamp(toNumber(per.kcal) ?? 0, 0, 900)),
      protein: round1(clamp(toNumber(per.protein) ?? 0, 0, 100)),
      carbs: round1(clamp(toNumber(per.carbs) ?? 0, 0, 100)),
      fat: round1(clamp(toNumber(per.fat) ?? 0, 0, 100)),
      matched,
    })
  }
  return items
}

export interface MealPhraseResult {
  ok: boolean
  items: PhraseItem[]
  error: string
  ms: number
}

/** 把一句话交给模型拆项；foods 传当前食物库，命中的直接查表 */
export async function analyzeMealPhrase(
  config: AiConfig,
  phrase: string,
  foods: HealthFood[],
): Promise<MealPhraseResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: systemPrompt(foods) },
      { role: 'user', content: phrase },
    ],
    temperature: 0.2,
  })

  if (!result.ok) {
    return { ok: false, items: [], error: explainFailure(result, config.baseUrl), ms: result.ms }
  }

  const items = parseMealPhrase(pickReply(result.body))
  if (items.length === 0) {
    return {
      ok: false,
      items: [],
      error: translate('health.err.phraseNotRecognized'),
      ms: result.ms,
    }
  }
  return { ok: true, items, error: '', ms: result.ms }
}

/** 看一张「这一餐」的照片，拆成同样的条目结构 */
function photoPrompt(foods: HealthFood[]) {
  const table = libraryTable(foods)
  const library = table === '' ? '（空）' : table
  return `你负责看一张饭菜照片，把这一餐拆成几项可以记进饮食账的食物。只做两件事：拆项、估克数。

已有食物库（格式：名称 每100g 热量/蛋白/碳水/脂肪，单位 kcal 和 g）：
${library}

规矩：
1. 照片里能看出来的每项食物都单独成条：米饭、主菜、配菜、饮料分开写，不合并。
2. 命中上面食物库的，原样用库里的名字和每 100g 数值，matched 填库里的名字；不许自己另估。
3. 没命中的才自己估：按家常做法，油炸、带皮、红烧往高里估。
4. grams 是你按照片里的份量目测的克数，参考：一碗米饭 ≈200g、一拳米饭 ≈150g、一拳蔬菜 ≈100g、一掌肉 ≈100g。
5. 营养一律按每 100g 给，单位 kcal 和 g。
6. 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白。

格式：
{"items":[{"name":"米饭","matched":"","grams":200,"per100g":{"kcal":116,"protein":2.6,"carbs":25.9,"fat":0.3}}]}`
}

export interface MealPhotoResult {
  ok: boolean
  items: PhraseItem[]
  error: string
  ms: number
}

export async function analyzeMealPhoto(
  config: AiConfig,
  imageDataUrl: string,
  foods: HealthFood[],
): Promise<MealPhotoResult> {
  const image: ChatContentPart = { type: 'image_url', image_url: { url: imageDataUrl } }
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: photoPrompt(foods) },
      {
        role: 'user',
        content: [
          { type: 'text', text: '这是我这一餐的照片，请按规矩拆项并估算每项克数。' },
          image,
        ],
      },
    ],
    temperature: 0.2,
  })

  if (!result.ok) {
    return { ok: false, items: [], error: explainFailure(result, config.baseUrl), ms: result.ms }
  }

  const items = parseMealPhrase(pickReply(result.body))
  if (items.length === 0) {
    return {
      ok: false,
      items: [],
      error: translate('health.err.mealPhotoNotRecognized'),
      ms: result.ms,
    }
  }
  return { ok: true, items, error: '', ms: result.ms }
}
