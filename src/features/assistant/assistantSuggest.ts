/**
 * 推荐问：回答完之后，给用户几个可以直接点的问题。
 *
 * 主路径是让模型按「最近对话 + 长期记忆」现想三条用户可能会发的话；
 * 模型没配好或请求失败时，才退回按上一段回答的话题挑预设几条。
 * 只有用户展开下拉栏时才发请求，平时不额外消耗 token。
 */
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { chat, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import type {
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
  HealthProfile,
  HealthSleep,
} from '@/core/db/schema'
import { shiftDay } from '@/core/utils/dateKey'

interface Rule {
  /** 匹配上一段回答里的话题（中英文都认，回答语言不一定是中文） */
  pattern: RegExp
  keys: MessageKey[]
}

const RULES: Rule[] = [
  {
    pattern: /体重|称重|公斤|kg|weigh|weight/i,
    keys: [
      'assistant.suggest.weight',
      'assistant.suggest.sleep',
      'assistant.suggest.log',
    ],
  },
  {
    pattern: /睡眠|熬夜|失眠|睡|sleep/i,
    keys: [
      'assistant.suggest.sleep',
      'assistant.suggest.mood',
      'assistant.suggest.plan',
    ],
  },
  {
    pattern: /花|支出|收入|消费|钱|finance|spend|expense/i,
    keys: [
      'assistant.suggest.finance',
      'assistant.suggest.summary',
      'assistant.suggest.log',
    ],
  },
  {
    pattern: /日记|心情|烦恼|情绪|焦虑|mood|diary|emotion/i,
    keys: [
      'assistant.suggest.mood',
      'assistant.suggest.sleep',
      'assistant.suggest.plan',
    ],
  },
  {
    pattern: /吃|热量|饮食|蛋白|calorie|kcal|diet/i,
    keys: [
      'assistant.suggest.food',
      'assistant.suggest.weight',
      'assistant.suggest.log',
    ],
  },
]

const FALLBACK: MessageKey[] = [
  'assistant.suggest.summary',
  'assistant.suggest.more',
  'assistant.suggest.log',
]

/**
 * 按上一段回答挑三条推荐问。
 * 话题规则按顺序第一条命中的就够，避免把整段回答拆成八条推荐。
 */
export function suggestKeys(lastReply: string, limit = 3): MessageKey[] {
  const text = lastReply.trim()
  const keys = RULES.find((rule) => rule.pattern.test(text))?.keys ?? FALLBACK
  return [...new Set(keys)].slice(0, limit)
}

/** 行首的编号、符号和包裹的引号都不算内容，解析时先剥掉 */
function cleanLine(line: string) {
  return line
    .replace(/^[\s#>]+/, '')
    .replace(/^\d+[.、)）]\s*/, '')
    .replace(/^[-*•·]\s*/, '')
    .replace(/^["'“”「」『』]+/, '')
    .replace(/["'“”「」『』]+$/, '')
    .trim()
}

/**
 * 把模型返回的整段文字拆成三条候选。
 * 只认非空、长度合理的行；带代码围栏或解释性冒号的行直接丢掉。
 */
export function parseSuggestions(reply: string, limit = 3): string[] {
  const lines = reply
    .split('\n')
    .filter((line) => !line.trim().startsWith('```'))
    .map(cleanLine)
    .filter((line) => line.length >= 2 && line.length <= 60)
  return [...new Set(lines)].slice(0, limit)
}

/** 推荐问要用到的本机记录；只读，不会写回任何东西 */
export interface SituationData {
  profile?: HealthProfile | null
  entries?: DiaryEntry[]
  stamps?: DiaryStamp[]
  intakes?: HealthIntake[]
  sleeps?: HealthSleep[]
  finance?: FinanceEntry[]
}

/** 'HH:MM' → 当天第几分钟；格式不对返回 null */
function minutesOf(clock: string): number | null {
  const [hour, minute] = clock.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

/** 一夜睡了多少小时；跨零点按第二天算 */
function sleepHours(sleep: HealthSleep): number | null {
  const bed = minutesOf(sleep.bedtime)
  const wake = minutesOf(sleep.wakeTime)
  if (bed === null || wake === null) return null
  const span = wake - bed
  return (span < 0 ? span + 24 * 60 : span) / 60
}

/**
 * 把本机记录压成几句「当前情况」，跟着推荐问一起发给模型。
 * 只给近 7 天的量、今天的摄入与昨夜睡眠，不把整库原文塞进去，
 * 既能让推荐贴合实际，又不会把 token 吃光；软删除的记录一律不算。
 */
export function summarizeSituation(data: SituationData, today: string): string[] {
  const lines: string[] = [`Today: ${today}`]
  const profile = data.profile ?? null

  if (profile) {
    const bits: string[] = []
    if (profile.weightKg !== null) bits.push(`weight ${profile.weightKg} kg`)
    if (profile.targetKcal !== null) bits.push(`daily target ${profile.targetKcal} kcal`)
    if (profile.proteinTarget !== null) bits.push(`protein goal ${profile.proteinTarget} g`)
    if (profile.activity !== null) bits.push(`activity ${profile.activity}`)
    if (bits.length > 0) lines.push(`Profile: ${bits.join(', ')}`)

    const latest = profile.weighIns?.[0]
    if (latest) lines.push(`Latest weigh-in: ${latest.dateKey}, ${latest.weightKg} kg`)
  }

  const intakes = (data.intakes ?? []).filter(
    (item) => item.deletedAt === null && item.dateKey === today,
  )
  if (intakes.length > 0) {
    const kcal = Math.round(intakes.reduce((sum, item) => sum + item.kcal, 0))
    const protein = Math.round(intakes.reduce((sum, item) => sum + item.protein, 0))
    lines.push(`Today's intake: ${kcal} kcal, ${protein} g protein, ${intakes.length} entries`)
  }

  const sleep = (data.sleeps ?? []).find(
    (item) => item.deletedAt === null && item.dateKey === today,
  )
  if (sleep) {
    const hours = sleepHours(sleep)
    const quality = sleep.quality === null ? 'unrated' : `${sleep.quality}/5`
    if (hours !== null) lines.push(`Last night: ${hours.toFixed(1)} h, quality ${quality}`)
  }

  const from = shiftDay(today, -6)
  const inRange = (dateKey: string) => dateKey >= from && dateKey <= today
  const entries = (data.entries ?? []).filter(
    (item) => item.deletedAt === null && inRange(item.dateKey) && item.content.trim() !== '',
  )
  const stamps = (data.stamps ?? []).filter(
    (item) => item.deletedAt === null && inRange(item.dateKey),
  )
  if (entries.length > 0 || stamps.length > 0) {
    lines.push(`Last 7 days: ${entries.length} diary entries, ${stamps.length} notes`)
  }

  const finance = (data.finance ?? []).filter(
    (item) => item.deletedAt === null && inRange(item.dateKey),
  )
  if (finance.length > 0) {
    const spent = finance
      .filter((item) => item.kind === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)
    const income = finance
      .filter((item) => item.kind === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
    lines.push(`Last 7 days money: spent ${Math.round(spent)}, income ${Math.round(income)}`)
  }

  return lines
}

const SYSTEM_PROMPT =
  'You suggest what the user might want to send next to a personal journaling assistant. ' +
  'Use the recent conversation, the saved memories and the current situation (real local records) to stay specific. ' +
  'Never invent numbers that are not in the situation; if something is missing, ask about it instead. ' +
  'Output exactly 3 short messages, one per line, no numbering, no quotes, no explanation. ' +
  'Keep each under 20 characters in Chinese/Japanese/Korean or about 12 words in other languages. ' +
  'Write in the same language as the recent conversation.'

/**
 * 让模型现想三条推荐。失败时返回空数组，调用方退回预设。
 * 只带最近六条对话和长期记忆，不把整库数据塞进这个轻量请求里。
 */
export async function requestSuggestions({
  config,
  recent,
  memories,
  situation = [],
}: {
  config: AiConfig
  recent: { role: 'user' | 'assistant'; content: string }[]
  memories: string[]
  situation?: string[]
}): Promise<string[]> {
  const conversation = recent
    .filter((item) => item.content.trim() !== '')
    .slice(-6)
    .map((item) => `${item.role === 'user' ? 'U' : 'A'}: ${item.content.slice(0, 400)}`)
    .join('\n')
  const memoryText = memories.slice(0, 20).join('\n')

  const result = await chat({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          recent.length > 0 ? `Recent conversation:\n${conversation}` : '',
          memoryText !== '' ? `Saved memories:\n${memoryText}` : '',
          situation.length > 0 ? `Current situation:\n${situation.join('\n')}` : '',
          'Return three lines.',
        ]
          .filter((part) => part !== '')
          .join('\n\n'),
      },
    ],
  })

  if (!result.ok) return []
  return parseSuggestions(pickReply(result.body))
}
