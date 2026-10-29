/**
 * 食物照片 → 结构化营养。
 *
 * 跟手写日记一样分两段：图片压缩复用 aiVision.compressImage，
 * 这里只管「说什么」和「怎么把回答解析成数字」。
 *
 * 解析这步单独写成纯函数，方便用假回答做单测——
 * 模型输出千奇百怪（代码块、小数、百分比、把 kcal 写成 165/100g），
 * 都在 parseFoodAnalysis 里收敛，UI 不碰这些脏活。
 */
import type { ChatContentPart } from '@/platform/desktop'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import { translate } from '@/shared/i18n/context'
import { round2 } from './healthMath'

/** 模型给出来的一份食物 */
export interface FoodGuess {
  name: string
  /** 这一份大约多少克 */
  grams: number
  /** 每 100g 的营养 */
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** 常见份量名，例如「一碗」「一片」；没有就 null */
  servingName: string | null
  /** 一份多少克；没有就 null */
  servingGrams: number | null
  /** 命中了食物库里已有的名字，没命中就是空串 */
  matched: string
}

/** 默认按 100g 估一份，模型没给克数时用 */
const DEFAULT_GRAMS = 100

/** 看图的两条路子：拍食物估算，或者照着包装上的营养成分表读数字 */
export type PhotoMode = 'dish' | 'label'

function systemPrompt(libraryNames: string[], mode: PhotoMode) {
  const names = libraryNames.filter((name) => name.trim() !== '').slice(0, 80)
  const library = names.length === 0 ? '（空）' : names.join('、')
  if (mode === 'label') {
    return `你负责看一张营养成分表照片，把表上的数字读出来，不要自己发挥。

已有食物库（能对上就从这里挑名字）：${library}

规矩：
- 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白
- 优先读「每 100 克 / 每 100 g」那一列
- 表里只有「每份」时，按标示的每份克数换算成每 100g 再填
- 能量那行常写作「能量 / 千焦 kJ」：如果是千焦，先除以 4.184 换成千卡
- 蛋白质 / 碳水化合物 / 脂肪照表填，单位 g；碳水化合物也可能是「糖类」
- name 用包装上的产品名，不要写「营养成分表」
- servingName / servingGrams：标签写了「每份 XX g」就填「一份」和克数，否则两个都填空字符串
- grams 填一份的克数，没有就填 100
- 读不出来的字段填 0，不要编造
- matched 只能填上面「已有食物库」里出现过的名字；对不上就填空字符串

格式：
{"name":"全麦面包","grams":100,"kcal":247,"protein":9.8,"carbs":41,"fat":3.5,"servingName":"","servingGrams":"","matched":""}`
  }
  return `你负责看一张食物照片，估算它的营养。

已有食物库（能对上就从这里挑名字）：${library}

规矩：
- 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白
- name 用中文常见叫法，写具体一点，例如「红烧牛肉面」而不是「面条」
- 营养一律按每 100g 给，单位 kcal 和 g；拿不准就按同类食物的常识值估
- grams 是你目测这一份的重量（克），不要填 100 了事
- servingName / servingGrams 只在能看出明确份量时填（一碗约 300g），否则两个都填空字符串
- matched 只能填上面「已有食物库」里出现过的名字；对不上就填空字符串
- 如果是饮料，按杯子估重量

格式：
{"name":"白米饭","grams":200,"kcal":116,"protein":2.6,"carbs":25.9,"fat":0.3,"servingName":"一碗","servingGrams":200,"matched":""}`
}

/** 模型偶尔会把 JSON 包进代码块，先剥掉 */
function stripFence(text: string) {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

/** 从任意形状里抠数字：接受 "165"、"165kcal"、"165/100g"、"23.5%" */
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

/**
 * 把模型回答解析成一份食物；认不出名字就返回 null。
 * 数字缺失时按 0 处理，异常值一律夹到合理区间，不让 NaN 流进存储。
 */
export function parseFoodAnalysis(reply: string): FoodGuess | null {
  const text = stripFence(reply)
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }

  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (name === '') return null

  // 有的模型会套一层 per100g
  const per =
    data.per100g && typeof data.per100g === 'object'
      ? (data.per100g as Record<string, unknown>)
      : data

  const kcal = clamp(toNumber(per.kcal) ?? 0, 0, 900)
  const protein = clamp(toNumber(per.protein) ?? 0, 0, 100)
  const carbs = clamp(toNumber(per.carbs) ?? 0, 0, 100)
  const fat = clamp(toNumber(per.fat) ?? 0, 0, 100)

  const rawGrams = toNumber(data.grams) ?? DEFAULT_GRAMS
  const grams = round2(clamp(rawGrams, 1, 5000))

  const servingName = typeof data.servingName === 'string' ? data.servingName.trim() : ''
  const rawServing = toNumber(data.servingGrams)
  const servingGrams =
    servingName !== '' && rawServing !== null && rawServing > 0
      ? round2(clamp(rawServing, 1, 5000))
      : null

  const matched = typeof data.matched === 'string' ? data.matched.trim() : ''

  return {
    name,
    grams,
    kcal: round2(kcal),
    protein: round2(protein),
    carbs: round2(carbs),
    fat: round2(fat),
    servingName: servingName === '' ? null : servingName,
    servingGrams,
    matched,
  }
}

export interface FoodAnalysisResult {
  ok: boolean
  guess: FoodGuess | null
  /** 失败时的人话 */
  error: string
  ms: number
}

/**
 * 把一张压缩好的图片交给模型，拿回营养估算。
 * libraryNames 传当前食物库的名字，让模型能判断「这个我这儿已经有了」。
 */
export async function analyzeFoodPhoto(
  config: AiConfig,
  imageDataUrl: string,
  libraryNames: string[],
  mode: PhotoMode = 'dish',
): Promise<FoodAnalysisResult> {
  const part: ChatContentPart = { type: 'image_url', image_url: { url: imageDataUrl } }
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: systemPrompt(libraryNames, mode) },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              mode === 'label'
                ? '这是包装上的营养成分表，请按上面的规矩读出每 100g 的数据。'
                : '这是我吃的东西，请按上面的规矩估算营养。',
          },
          part,
        ],
      },
    ],
  })

  if (!result.ok) {
    return { ok: false, guess: null, error: explainFailure(result, config.baseUrl), ms: result.ms }
  }

  const guess = parseFoodAnalysis(pickReply(result.body))
  if (!guess) {
    return {
      ok: false,
      guess: null,
      error:
        mode === 'label'
          ? translate('health.err.labelNotRead')
          : translate('health.err.foodPhotoNotRecognized'),
      ms: result.ms,
    }
  }
  return { ok: true, guess, error: '', ms: result.ms }
}
