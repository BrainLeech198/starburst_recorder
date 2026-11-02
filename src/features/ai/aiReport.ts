/**
 * 「把一段时间整理成回顾」的提示词与调用。
 *
 * 与 aiCompose 的区别：那边写的是「一天一篇日记」，主语是当天的生活；
 * 这里是「一周 / 一个月的回顾」，主语是这段时间的变化与值得记住的事。
 * 素材同样只从记录里来，不许模型编造没发生的事。
 *
 * 规格参考了用户另一套训练记录（fit）里的多维修报：先结论、和上一期
 * 对比、能量收支分清「维持线 / 目标线 / 实际」三条线、体重只看序列、
 * 风险点和下一步必须能执行。素材层把数字算全，让模型只做归纳不做口算。
 */
import type { BackupData } from '@/core/db/store'
import { formatDateCn, shiftDay, weekdayLabel } from '@/core/utils/dateKey'
import type { HealthProfile } from '@/core/db/schema'
import {
  napMinutes,
  sleepMinutes,
  sleepNapStats,
  sleepParts,
  sleepWakeStats,
} from '@/features/health/sleepMath'
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

/** 逐日遍历 [from, to]（含首尾） */
function* dateKeysBetween(from: string, to: string): Generator<string> {
  let cursor = from
  while (cursor <= to) {
    yield cursor
    cursor = shiftDay(cursor, 1)
  }
}

/** 区间天数（含首尾），上一期按同样长度往前平移 */
function rangeDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

/** 上一周期：紧邻本期、等长的一段时间 */
function prevPeriod(period: ReportPeriod): ReportPeriod {
  const days = rangeDays(period.from, period.to)
  const to = shiftDay(period.from, -1)
  const from = shiftDay(to, -(days - 1))
  return { kind: period.kind, from, to, label: `${from} ~ ${to}` }
}

function hoursMinutes(minutes: number): string {
  const parts = sleepParts(Math.round(minutes))
  return `${parts.h} 小时 ${parts.m} 分`
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
  const weighIn = data.profile?.weighIns.find((item) => item.dateKey === dateKey)

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
    weighIn !== undefined ||
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
    const protein = Math.round(intakes.reduce((sum, item) => sum + item.protein, 0))
    const carbs = Math.round(intakes.reduce((sum, item) => sum + item.carbs, 0))
    const fat = Math.round(intakes.reduce((sum, item) => sum + item.fat, 0))
    const times = intakes.map((item) => item.time.slice(0, 5)).sort()
    const names = intakes.map((item) => item.name).slice(0, 6).join('、')
    const window = times.length > 1 ? `${times[0]}–${times[times.length - 1]}；` : ''
    lines.push(
      `  饮食：${kcal} 千卡（蛋白 ${protein}、碳水 ${carbs}、脂肪 ${fat}）；进食窗 ${window}${names}`,
    )
  }
  if (weighIn) {
    lines.push(`  体重：${weighIn.weightKg.toFixed(1)} kg`)
  }
  if (sleep) {
    const bits: string[] = [hoursMinutes(sleepMinutes(sleep.bedtime, sleep.wakeTime))]
    if (sleep.quality !== null) bits.push(`质量 ${sleep.quality}/5`)
    const wakes = sleepWakeStats(sleep)
    if (wakes.count !== null && wakes.count > 0) {
      bits.push(`夜醒 ${wakes.count} 次${wakes.minutes ? ` 共 ${wakes.minutes} 分` : ''}`)
    }
    const naps = sleepNapStats(sleep.naps)
    if (naps.count > 0) bits.push(`小睡 ${naps.count} 次共 ${naps.minutes} 分`)
    lines.push(`  睡眠：${bits.join('，')}`)
  }
  for (const training of trainings) {
    const title = training.title || training.kind
    const bits: string[] = [title]
    if (training.durationMin !== null) bits.push(`${training.durationMin} 分钟`)
    if (training.feeling !== null) bits.push(`感受 ${training.feeling}/5`)
    const exercises = training.exercises
      .slice(0, 4)
      .map((ex) => `${ex.name}×${ex.sets.length} 组`)
      .join('、')
    lines.push(`  训练：${bits.join('，')}${exercises !== '' ? `（${exercises}）` : ''}`)
  }
  if (expense > 0 || income > 0) {
    const parts: string[] = []
    if (expense > 0) {
      const top = finance
        .filter((item) => item.kind === 'expense')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4)
        .map((item) => `${item.name} ${Math.round(item.amount)}`)
        .join('、')
      parts.push(`支出 ${Math.round(expense)} 元（${top}）`)
    }
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
  sleepQualitySum: number
  sleepQualityCount: number
  wakeCount: number
  napMinutes: number
  intakes: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  trainingSessions: number
  trainingMinutes: number
  /** 区间内的空腹称重，日期升序 */
  weights: { dateKey: string; kg: number }[]
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
  const weights = (data.profile?.weighIns ?? [])
    .filter((item) => inRange(item.dateKey))
    .map((item) => ({ dateKey: item.dateKey, kg: item.weightKg }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))

  const days = new Set<string>()
  for (const list of [entries, stamps, intakes, finance, sleeps, trainings]) {
    for (const item of list) days.add(item.dateKey)
  }
  for (const item of weights) days.add(item.dateKey)

  let scheduleTotal = 0
  let scheduleDone = 0
  for (const dateKey of dateKeysBetween(period.from, period.to)) {
    const rows = occurrencesOn(data.schedules, dateKey)
    scheduleTotal += rows.length
    scheduleDone += rows.filter((item) => isDoneOn(item, dateKey)).length
    // 只有日程的日子也算「有记录」，和逐日素材的口径一致
    if (rows.length > 0) days.add(dateKey)
  }

  let wakeCount = 0
  for (const sleep of sleeps) {
    const stats = sleepWakeStats(sleep)
    if (stats.count !== null) wakeCount += stats.count
  }

  return {
    days: days.size,
    entries: entries.length,
    stamps: stamps.length,
    expense: finance.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amount, 0),
    income: finance.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0),
    sleepNights: sleeps.length,
    sleepMinutes: sleeps.reduce((sum, item) => sum + sleepMinutes(item.bedtime, item.wakeTime), 0),
    sleepQualitySum: sleeps.reduce((sum, item) => sum + (item.quality ?? 0), 0),
    sleepQualityCount: sleeps.filter((item) => item.quality !== null).length,
    wakeCount,
    napMinutes: sleeps.reduce(
      (sum, item) => sum + (item.naps ?? []).reduce((s, nap) => s + napMinutes(nap), 0),
      0,
    ),
    intakes: intakes.length,
    kcal: intakes.reduce((sum, item) => sum + item.kcal, 0),
    protein: intakes.reduce((sum, item) => sum + item.protein, 0),
    carbs: intakes.reduce((sum, item) => sum + item.carbs, 0),
    fat: intakes.reduce((sum, item) => sum + item.fat, 0),
    trainingSessions: trainings.length,
    trainingMinutes: trainings.reduce((sum, item) => sum + (item.durationMin ?? 0), 0),
    weights,
    scheduleDone,
    scheduleTotal,
  }
}

/** 总量是否全空：全空的上期直接省略，免得模型对着零硬比 */
function isEmptyTotals(t: ReportTotals): boolean {
  return (
    t.entries === 0 &&
    t.stamps === 0 &&
    t.expense === 0 &&
    t.income === 0 &&
    t.intakes === 0 &&
    t.sleepNights === 0 &&
    t.trainingSessions === 0 &&
    t.weights.length === 0 &&
    t.scheduleTotal === 0
  )
}

/** 把总量写成一段行：本期和上期共用同一个口径 */
function totalsLines(totals: ReportTotals): string[] {
  const lines = [
    `有记录的天数：${totals.days}`,
    `日记 ${totals.entries} 篇，随记 ${totals.stamps} 条`,
    `支出 ${Math.round(totals.expense)} 元，收入 ${Math.round(totals.income)} 元`,
  ]
  if (totals.intakes > 0) {
    lines.push(
      `摄入 ${Math.round(totals.kcal)} 千卡（${totals.intakes} 笔，日均 ${Math.round(totals.kcal / totals.days)}），` +
        `蛋白 ${Math.round(totals.protein)} g、碳水 ${Math.round(totals.carbs)} g、脂肪 ${Math.round(totals.fat)} g`,
    )
  } else {
    lines.push('饮食：没有记录')
  }
  lines.push(
    totals.sleepNights > 0
      ? `睡眠 ${totals.sleepNights} 夜，平均 ${hoursMinutes(totals.sleepMinutes / totals.sleepNights)}` +
          (totals.sleepQualityCount > 0
            ? `，质量均分 ${(totals.sleepQualitySum / totals.sleepQualityCount).toFixed(1)}/5`
            : '') +
          (totals.wakeCount > 0 ? `，夜醒共 ${totals.wakeCount} 次` : '') +
          (totals.napMinutes > 0 ? `，小睡共 ${totals.napMinutes} 分` : '')
      : '睡眠：没有记录',
  )
  lines.push(
    totals.trainingSessions > 0
      ? `训练 ${totals.trainingSessions} 次，共 ${totals.trainingMinutes} 分钟`
      : '训练：没有记录',
  )
  lines.push(
    totals.scheduleTotal > 0
      ? `日程完成 ${totals.scheduleDone}/${totals.scheduleTotal}`
      : '日程：没有安排',
  )
  if (totals.weights.length > 0) {
    const first = totals.weights[0]
    const last = totals.weights[totals.weights.length - 1]
    const diff = last.kg - first.kg
    lines.push(
      `体重序列：${totals.weights.map((w) => `${w.dateKey.slice(5)} ${w.kg.toFixed(1)}`).join(' → ')}` +
        (totals.weights.length > 1 ? `（变化 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} kg）` : ''),
    )
  } else {
    lines.push('体重：没有称重')
  }
  return lines
}

/** 身体档案里的三条线：维持 / 目标 / 蛋白；没填就说没填，让模型别编 */
function goalLines(profile: HealthProfile | null): string {
  const tdee = profile?.tdee ?? null
  const target = profile?.targetKcal ?? null
  const protein = profile?.proteinTarget ?? null
  if (tdee === null && target === null && protein === null) return '目标线：没有设置'
  const bits: string[] = []
  if (tdee !== null) bits.push(`维持 ${Math.round(tdee)} 千卡`)
  if (target !== null) bits.push(`目标 ${Math.round(target)} 千卡`)
  if (protein !== null) bits.push(`蛋白目标 ${Math.round(protein)} g`)
  return `目标线：${bits.join(' / ')}`
}

const SYSTEM_PROMPT_WEEK = buildSystemPrompt('week')
const SYSTEM_PROMPT_MONTH = buildSystemPrompt('month')

function buildSystemPrompt(kind: ReportKind): string {
  const thisWord = kind === 'week' ? '本周' : '本月'
  const prevWord = kind === 'week' ? '上周' : '上月'
  return `你负责把一个人一段时间里的记录，整理成一篇回顾（${thisWord}报）。

素材只有这些：日记正文、随记、饮食（热量与蛋白/碳水/脂肪、进食时间）、睡眠（时长、质量、夜醒、小睡）、体重称重、训练（项目、时长、感受、动作组数）、收支（含大件名目）、日程完成情况，以及 ${thisWord} 与 ${prevWord} 的总量和身体档案的目标线（维持线 / 目标线 / 蛋白目标）。
规矩：
- 只使用素材里真实出现过的事实，人物、地点、数字都不许编造；素材里没有的就不写，不要用「可能」「大概」去补一个不存在的细节
- 数字要交代清楚比的是哪条线：写「超」或「缺口」时必须写明是对比维持线、目标线还是实际摄入；目标线没设置的，只报绝对值和日均
- 体重只看序列和方向，不评价单日数字（水分、钠、糖原的正常波动可以达到 1 kg 以上）；没有称重记录就不谈体重
- 和${prevWord}的对比只看方向（多了少了、好了坏了），不抠小数；${prevWord}没有记录就整段省略对比
- 不要逐条复述记录，也不要写成账单或清单；用几段连贯的话把这段时间串起来
- 结论先说：「${thisWord}结论」用一两句话加两三个关键数字，先讲清整体怎么样
- 「风险点」只写素材支撑得住的隐患（例如蛋白持续不达标、连续熬夜、某类支出失控），没有就省略这一段
- 「下一步」给一三条能直接执行的动作，和前面提到的问题对得上；不要喊口号，不要强行积极
- 语气平实，第一人称，像写给自己看的总结
- 不要输出开场白（例如「以下是」「这是一篇」），也不要结尾的解释
- 只输出回顾正文，按下面的结构分段，每段前用「## 」加一句小标题；某段确实没有素材就整段省略，篇幅跟着素材量走，不要硬凑：
  ## ${thisWord}结论
  ## 和${prevWord}比
  ## 值得记住的
  ## 能量与营养
  ## 训练与恢复
  ## 作息与睡眠
  ## 花销
  ## 风险点
  ## 下一步`
}

/** 把这段时间的素材拼成给模型看的那段话 */
export function buildReportUserPrompt(
  data: BackupData,
  period: ReportPeriod,
  totals: ReportTotals = reportTotals(data, period),
): string {
  const prevWord = period.kind === 'week' ? '上周' : '上月'
  const prev = reportTotals(data, prevPeriod(period))

  const lines = [
    `范围：${period.label}（${formatDateCn(period.from)} 至 ${formatDateCn(period.to)}）`,
    goalLines(data.profile),
    '',
    `— ${period.kind === 'week' ? '本周' : '本月'}总量 —`,
    ...totalsLines(totals),
    '',
  ]
  if (!isEmptyTotals(prev)) {
    lines.push(`— ${prevWord}总量（对比用）—`, ...totalsLines(prev), '')
  } else {
    lines.push(`— ${prevWord}：没有可用记录，跳过对比 —`, '')
  }
  lines.push('— 每天的记录 —')

  let wrote = false
  for (const dateKey of dateKeysBetween(period.from, period.to)) {
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
      { role: 'system', content: period.kind === 'week' ? SYSTEM_PROMPT_WEEK : SYSTEM_PROMPT_MONTH },
      { role: 'user', content: buildReportUserPrompt(data, period) },
    ],
  })
  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  return { ok: true, content: stripMetaLine(content), error: '', ms: result.ms }
}
