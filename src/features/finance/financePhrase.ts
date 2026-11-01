/**
 * 一句话记一笔收支：把「午饭花了 25」「打车 18 块」「发工资 8000」这类口语
 * 拆成可以直接落库的一条收支。
 *
 * 和 mealPhrase 一样分两段：提示词与解析在纯函数里，请求走 aiClient，
 * 这样解析规则能单测，页面只负责展示。
 */
import type { FinanceKind } from '@/core/db/schema'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import { isDateKey, todayKey } from '@/core/utils/dateKey'
import { FINANCE_CATEGORIES } from './financeCategories'

export interface FinanceDraft {
  kind: FinanceKind
  amount: number
  category: string
  name: string
  dateKey: string
  /** 'HH:MM:SS' */
  time: string
  note: string
}

const CATEGORY_IDS = FINANCE_CATEGORIES.map((item) => `${item.id}(${item.kind})`).join('、')

function clockSeconds(ms: number) {
  return new Date(ms).toTimeString().slice(0, 8)
}

function stripFence(text: string) {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const matched = value.replace(',', '.').match(/-?\d+(\.\d+)?/)
  if (!matched) return null
  const parsed = Number(matched[0])
  return Number.isFinite(parsed) ? parsed : null
}

/** 提示词：只要一个 JSON，金额必须给正数，方向单独用 kind 表示 */
export function financePrompt(today: string): string {
  return `你在帮用户把一句话记成一笔收支。只做一件事：抽取出金额、方向、分类、名称、日期与时刻。

今天是 ${today}。
分类只能从下面这些 id 里选，括号里是方向：
${CATEGORY_IDS}

规矩：
1. 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白。
2. kind 只能是 "expense"（支出）或 "income"（收入）。
3. amount 是正数，不要带货币符号；「25」「二十五」「25块」都写成 25。
4. category 必须用上面列表里的 id；拿不准就选 other（收入用 otherIncome）。
5. name 用用户原话里的项目名（例如「午饭」「打车」「工资」）；没有就留空。
6. dateKey 用 YYYY-MM-DD；用户没提日期就用今天 ${today}。
7. time 用 HH:MM:SS；用户没提时刻就留空字符串。
8. 不确定的字段留空，不要编造金额。

格式：
{"kind":"expense","amount":25,"category":"food","name":"午饭","dateKey":"${today}","time":"12:30:00","note":""}`
}

/** 解析模型返回；拿不到正数金额就返回 null */
export function parseFinancePhrase(reply: string, today = todayKey()): FinanceDraft | null {
  const json = stripFence(reply).match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }

  const amount = toNumber(data.amount)
  if (amount === null || amount <= 0) return null
  const kind: FinanceKind = data.kind === 'income' ? 'income' : 'expense'
  const rawCategory = typeof data.category === 'string' ? data.category.trim() : ''
  const category = FINANCE_CATEGORIES.some(
    (item) => item.id === rawCategory && item.kind === kind,
  )
    ? rawCategory
    : kind === 'income'
      ? 'otherIncome'
      : 'other'
  const dateKey =
    typeof data.dateKey === 'string' && isDateKey(data.dateKey) ? data.dateKey : today
  const rawTime = typeof data.time === 'string' ? data.time.trim() : ''
  const time = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(rawTime)
    ? rawTime.length === 5
      ? `${rawTime}:00`
      : rawTime
    : clockSeconds(Date.now())

  return {
    kind,
    amount: Math.round(amount * 100) / 100,
    category,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    dateKey,
    time,
    note: typeof data.note === 'string' ? data.note.trim() : '',
  }
}

export interface FinancePhraseResult {
  ok: boolean
  draft: FinanceDraft | null
  error: string
}

export async function analyzeFinancePhrase(
  config: AiConfig,
  phrase: string,
  today = todayKey(),
): Promise<FinancePhraseResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: financePrompt(today) },
      { role: 'user', content: phrase },
    ],
    temperature: 0.1,
  })

  if (!result.ok) {
    return { ok: false, draft: null, error: explainFailure(result, config.baseUrl) }
  }

  const draft = parseFinancePhrase(pickReply(result.body), today)
  if (!draft) {
    return { ok: false, draft: null, error: '' }
  }
  return { ok: true, draft, error: '' }
}
