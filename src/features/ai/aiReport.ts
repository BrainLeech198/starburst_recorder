/**
 * 「把一段时间整理成回顾」的提示词与调用。
 *
 * 与 aiCompose 的区别：那边写的是「一天一篇日记」，主语是当天的生活；
 * 这里是「一周 / 一个月的回顾」，主语是这段时间的变化与值得记住的事。
 * 素材同样只从记录里来，不许模型编造没发生的事。
 */
import type { BackupData } from '@/core/db/store'
import { formatDateCn, weekdayLabel } from '@/core/utils/dateKey'
import { sleepMinutes, sleepParts } from '@/features/health/sleepMath'
import { occurrencesOn, isDoneOn } from '@/features/schedule/scheduleMath'
import { explainFailure, pickReply, chat } from './aiClient'
import type { AiConfig } from './aiConfig'
import { stripMetaLine } from './aiCompose'

export type ReportKind = 'week' | 'month'

export interface ReportPeriod {
  kind: ReportKind
  /** 起止日期，含首尾 */
  from: string
  to: string
  /** 给人看的范围，例如「11/02 – 11/08」 */
  label: string
}

const ENTRY_CHARS = 220
const STAMP_CHARS = 90

function clip(text: string, max: number) {
  const body = text.trim().replace(/\s+/g, ' ')
  return body.length > max ? `${body.slice(0, max)}…` : body
}

/** 一天的素材压成几行；没有任何内容时返回 null，整天空着不占篇幅 */
function dayLines(data: BackupData, dateKey: string): string[] | null {
  const entries = data.entries.filter((item) => item.dateKey === dateKey && item.deletedAt === null)
  const stamps = data.stamps.filter((item) => item.dateKey === dateKey && item.deletedAt === null)
  const intakes = data.intakes.filter((item) => item.dateKey === dateKey && item.deletedAt === null)
  const sleep = data.sleeps.find((item) => item.dateKey === dateKey && item.deletedAt === null)
  const trainings = data.trainings.filter(
    (item) => item.dateKey === dateKey && item.deletedAt === null,
  )
  const finance = data.finance.filter((item) => item.dateKey === dateKey && item.deletedAt === null)
  const schedules = occurrencesOn(data.schedules, dateKey).filter((item) => !item.deletedAt)

  const expense = finance
    .filter((item) => item.kind === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)
  const income = finance
    .filter((item) => item.kind === 'income')
    .reduce((sum, item) => sum + item.amount, 0)

  const hasContent =
    entries.length > 0 ||
    stamps.length > 0 ||
    intakes.length > 0 ||
    sleep !== undefined ||
    trainings.length > 0 ||
    expense > 0 ||
    income > 0 ||
    // 只有日程的日子也要留一行：完成与没完成本身就是回顾的一部分
    schedules.length > 0
  if (!hasContent) return null

  const lines = [`${formatDateCn(dateKey)} ${weekdayLabel(dateKey)}`]
  for (const entry of entries) {
    const body = clip(entry.content, ENTRY_CHARS)
    if (body !== '') lines.push(`  日记：${body}`)
  }
  for (const stamp of stamps) {
    if (stamp.content.trim() === '') continue
    lines.push(`  随记：${stamp.time} ${clip(stamp.content, STAMP_CHARS)}`)
  }
  if (intakes.length > 0) {
    const kcal = Math.round(intakes.reduce((sum, item) => sum + item.kcal, 0))
    lines.push(
      `  饮食：${kcal} 千卡（${intakes.map((item) => item.name).slice(0, 6).join('、')}）`,
    )
  }
  if (sleep) {
    const parts = sleepParts(sleepMinutes(sleep.bedtime, sleep.wakeTime))
    lines.push(`  睡眠：${parts.h} 小时 ${parts.m} 分`)
  }
  for (const training of trainings) {
    const title = training.title || training.kind
    lines.push(
      `  训练：${title}${training.durationMin !== null ? ` ${training.durationMin} 分钟` : ''}`,
    )
  }
  if (expense > 0 || income > 0) {
    const parts: string[] = []
    if (expense > 0) parts.push(`支出 ${Math.round(expense)} 元`)
    if (income > 0) parts.push(`收入 ${Math.round(income)} 元`)
    lines.push(`  收支：${parts.join('，')}`)
  }
  if (schedules.length > 0) {
    lines.push(
      `  日程：${schedules
        .map((item) => `${item.title}${isDoneOn(item, dateKey) ? '（已完成）' : '（未完成）'}`)
        .join('；')}`,
    )
  }
  return lines
}

export interface ReportTotals {
  days: number
  entries: number
  stamps: number
  expense: number
  income: number
  sleepNights: number
  sleepMinutes: number
  trainingSessions: number
  scheduleDone: number
  scheduleTotal: number
}

/** 这段时间的总量：开头给模型一个「这段时间大概是什么样」的底 */
export function reportTotals(data: BackupData, period: ReportPeriod): ReportTotals {
  const inRange = (dateKey: string) => dateKey >= period.from && dateKey <= period.to
  const entries = data.entries.filter((item) => inRange(item.dateKey) && item.deletedAt === null)
  const stamps = data.stamps.filter((item) => inRange(item.dateKey) && item.deletedAt === null)
  const intakes = data.intakes.filter((item) => inRange(item.dateKey) && item.deletedAt === null)
  const finance = data.finance.filter((item) => inRange(item.dateKey) && item.deletedAt === null)
  const sleeps = data.sleeps.filter((item) => inRange(item.dateKey) && item.deletedAt === null)
  const trainings = data.trainings.filter(
    (item) => inRange(item.dateKey) && item.deletedAt === null,
  )

  const days = new Set<string>()
  for (const list of [entries, stamps, intakes, finance, sleeps, trainings]) {
    for (const item of list) days.add(item.dateKey)
  }

  let scheduleTotal = 0
  let scheduleDone = 0
  const [year, month, day] = period.from.split('-').map(Number)
  const end = new Date(
    Number(period.to.slice(0, 4)),
    Number(period.to.slice(5, 7)) - 1,
    Number(period.to.slice(8, 10)),
  )
  for (let cursor = new Date(year, month - 1, day); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate(),
    ).padStart(2, '0')}`
    const rows = occurrencesOn(data.schedules, dateKey)
    scheduleTotal += rows.length
    scheduleDone += rows.filter((item) => isDoneOn(item, dateKey)).length
    // 只有日程的日子也算「有记录」，和逐日素材的口径一致
    if (rows.length > 0) days.add(dateKey)
  }

  return {
    days: days.size,
    entries: entries.length,
    stamps: stamps.length,
    expense: finance.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amount, 0),
    income: finance.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0),
    sleepNights: sleeps.length,
    sleepMinutes: sleeps.reduce(
      (sum, item) => sum + sleepMinutes(item.bedtime, item.wakeTime),
      0,
    ),
    trainingSessions: trainings.length,
    scheduleDone,
    scheduleTotal,
  }
}

const SYSTEM_PROMPT = `你负责把一个人一段时间里的记录，整理成一篇回顾（周报或月报）。

素材只有这些：日记正文、带时刻的随记、饮食热量、睡眠时长、训练、收支金额、日程完成情况。
规矩：
- 只使用素材里真实出现过的事实，人物、地点、数字都不许编造
- 素材里没有的，就不写；不要用「可能」「大概」去补一个不存在的细节
- 不要逐条复述记录，也不要写成账单或清单；用几段连贯的话把这段时间串起来
- 可以指出值得记住的事、重复出现的主题、身体与作息的走向、花销的大致去向
- 语气平实，第一人称，像写给自己看的总结；不要喊口号，也不要强行积极
- 不要输出开场白（例如「以下是」「这是一篇」），也不要结尾的解释
- 只输出回顾正文，按下面的结构分段，每段前用「## 」加一句小标题：
  ## 这段时间
  ## 值得记住的
  ## 身体与作息
  ## 花销
  ## 接下来
- 某一段确实没有素材就整段省略；篇幅跟着素材量走，不要硬凑`

/** 把这段时间的素材拼成给模型看的那段话 */
export function buildReportUserPrompt(
  data: BackupData,
  period: ReportPeriod,
  totals: ReportTotals = reportTotals(data, period),
): string {
  const lines = [
    `范围：${period.label}（${formatDateCn(period.from)} 至 ${formatDateCn(period.to)}）`,
    `有记录的天数：${totals.days}`,
    `日记 ${totals.entries} 篇，随记 ${totals.stamps} 条`,
    `支出 ${Math.round(totals.expense)} 元，收入 ${Math.round(totals.income)} 元`,
    totals.sleepNights > 0
      ? `睡眠 ${totals.sleepNights} 夜，平均 ${(() => {
          const parts = sleepParts(Math.round(totals.sleepMinutes / totals.sleepNights))
          return `${parts.h} 小时 ${parts.m} 分`
        })()}`
      : '睡眠：没有记录',
    `训练 ${totals.trainingSessions} 次`,
    totals.scheduleTotal > 0
      ? `日程完成 ${totals.scheduleDone}/${totals.scheduleTotal}`
      : '日程：没有安排',
    '',
    '— 每天的记录 —',
  ]

  const [year, month, day] = period.from.split('-').map(Number)
  const end = new Date(
    Number(period.to.slice(0, 4)),
    Number(period.to.slice(5, 7)) - 1,
    Number(period.to.slice(8, 10)),
  )
  let wrote = false
  for (let cursor = new Date(year, month - 1, day); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate(),
    ).padStart(2, '0')}`
    const block = dayLines(data, dateKey)
    if (!block) continue
    lines.push(...block)
    wrote = true
  }
  if (!wrote) lines.push('（这段时间没有可用的记录）')
  return lines.join('\n')
}

export interface ReportResult {
  ok: boolean
  content: string
  error: string
  ms: number
}

/** 把这段时间的记录交给模型，拿回一篇回顾草稿 */
export async function composeReport(
  config: AiConfig,
  data: BackupData,
  period: ReportPeriod,
): Promise<ReportResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    // 回顾要稳：数字和事实不能被改写，温度比写日记低一档
    temperature: 0.4,
    seed: Math.floor(Math.random() * 2 ** 31),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildReportUserPrompt(data, period) },
    ],
  })
  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  return { ok: true, content: stripMetaLine(content), error: '', ms: result.ms }
}
