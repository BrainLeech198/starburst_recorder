/**
 * 「把日常记录整理成一篇日记」的提示词与调用。
 *
 * 单独一个文件的原因：提示词是要反复调的东西，调它的时候不该动界面代码。
 */
import type {
  DiaryDay,
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
} from '@/core/db/schema'
import { formatDateCn, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherLabel } from '@/features/diary/weather'
import { chat, explainFailure, pickReply } from './aiClient'
import type { AiConfig } from './aiConfig'
import type { MessageKey } from '@/shared/i18n/messages/zh'

/** 当天能当素材的三类数据 */
export type ComposeSource = 'stamps' | 'health' | 'finance'

/** 一天里的素材，历史与当天共用一个形状 */
export interface ComposeDay {
  dateKey: string
  weather: string | null
  stamps: DiaryStamp[]
  intakes: HealthIntake[]
  finance: FinanceEntry[]
  /** 只有历史日才有；当天没有「已经写好的日记」这一项 */
  entries?: DiaryEntry[]
}

/** 给模型的全部输入 */
export interface ComposeContext {
  dateKey: string
  today: Omit<ComposeDay, 'dateKey' | 'entries'>
  sources: ComposeSource[]
  /** 更早的日子，新的排前面；调用方负责只放目标日期之前的 */
  history: ComposeDay[]
  /** 作者以前写过的日记正文，只学语气 */
  styleSamples: string[]
}

/** 历史摘要的字数上限，超出就丢掉更旧的日子 */
export const HISTORY_BUDGET = 4000
/** 文风样例最多取几篇、每篇最多多少字 */
export const STYLE_SAMPLE_COUNT = 5
export const STYLE_SAMPLE_CHARS = 300

/** 给 AI 的三种口气 */
export type ComposeStyle = 'natural' | 'child' | 'polished'

export const COMPOSE_STYLES: { id: ComposeStyle; labelKey: MessageKey }[] = [
  { id: 'natural', labelKey: 'ai.styleNatural' },
  { id: 'child', labelKey: 'ai.styleChild' },
  { id: 'polished', labelKey: 'ai.stylePolished' },
]

/** 三种口气都适用的规矩：这里写的是「怎么像一篇日记 + 怎么加工」 */
const BASE_RULES = `你负责把一个人这一天的记录，整理成一篇日记。

素材可能来自三处：随手记下的小事（带具体时刻）、当天吃了什么（带热量）、当天花了什么钱。
只使用被选中的素材；没被选中的，一个字都不要提。

最重要的一条，先记住：**时刻归属不许动**。
- 每一条随记都是在某个具体时刻发生的一件事，它前面那个时间就是这件事的时刻
- 同一条随记里的内容，是一整件事，必须在它自己的那个时刻里一次讲完
- 于是有三条硬规矩：
  1. **不许拆**：同一条记录里的内容，不许拆到全文两处分别讲，不许把一件事散开成「先…后来又…」的两条
  2. **不许并**：不同记录的事，不许并成一句「然后就…」或一段连写的叙述，让读者看不出它们发生在不同的时刻
  3. **不许换序**：必须按记录的时间从早到晚推进，不许倒叙、不许插叙、不许为了好看把顺序调乱

加工原则（不是「原文照搬」，是「用记录做素材写日记」）：
- 素材里的**事实**不能动：人物、地点、时间、数字、吃了什么、花了多少——这些必须保留，不许编造
- 摄入和收支不要写成账单：把数字自然织进当天的生活叙述里，只在素材里有时才写
- 但**表达**可以重组：换词、换语序、换句式、补一两句衔接——这些是应该做的
- 正确的做法：每条记录各自变成一两句连贯的话，条与条之间用一两句自然的衔接过渡，整体读起来是一篇日记
- 错误的做法一：一条一条原样抄下来，中间加换行就完事
- 错误的做法二：把一条记录的内容拆散到全文各处
- 错误的做法三：把不同时间的几件事揉成一句，抹掉它们各自的时刻
- 错误的做法四：把摄入和收支列成清单或报表

**旧记录**（如果有）是更早的日子，只用来理解这个人、正在持续的事和语气：
- 可以用一句话自然呼应，例如「昨天说要去复查，今天拿到了结果」
- 呼应必须基于旧记录里真实存在的内容，不许编造
- 不许把旧记录里的事写成今天发生的，也不许把旧记录整段复述一遍

写法要求：
- 第一人称，像写给自己看的话，不要出现「你」，不要称呼读者
- 每段直接开始写，段首不要加任何符号
- 可以用「早上」「中午」「傍晚」「睡前」这类时间词点出一件事的时刻，但它只能描述**这一条记录自己**的时刻，不能拿来概括好几条
- 给了天气就自然融进场景里；没给的信息一个字都别提
- 篇幅跟着素材的信息量走，不要硬凑长度
- 如果有文风参考，学它的句长、节奏和用词习惯，但不要照抄句子
- 每次写法不要跟前一次一模一样——换个用词、换个句式、换个节奏都行，别让读起来像套模板

硬性禁止：
- 不要输出「以下是」「这是一篇」「今天的日记」这类**开场白**
- 不要在正文之后加任何**解释、说明、总结**
- 只输出日记正文本身，什么都不要额外加`

const STYLE_RULES: Record<ComposeStyle, string> = {
  natural: `【加工动作】：把每条记录各自改写成一两句连贯的话，条与条之间用一两句碎碎念式的过渡串起来（比如「忙完这些」「天擦黑了」）。时刻归属不许动：同一条不许拆开，不同条不许并成一句。绝对不要一条一条原样抄下来。
【文风】：句子长短都有，像成年人随手写下来的，偶尔有一两句口语化的碎碎念（比如「怎么又这样」），不刻意工整，避免书面腔和排比句。`,

  child: `【加工动作】：把每条记录各自改写成短句，条与条之间用「然后」「后来」串起来——「然后」只是接话，不表示两件事变成一件。时刻归属不许动：同一条不许拆开，不同条不许并成一句。绝对不要一条一条原样抄下来。
【文风】：句子短，用词简单，开心和不开心都直白写出来；每写一件事就换一段，段落之间空一行。
【特别注意】直接写正文第一句，不要先写「今天我…」或者任何解释性的第一句——直接从发生的事开始。`,

  polished: `【加工动作】：把每条记录各自写成一两句讲究的话，用一条语气上的主线（比如「今天的心情」）把它们串起来，条与条之间用回忆、情绪或动作自然衔接。主线只是语气上的统一，**不能为了主线把不同时刻的事并到一处讲**，也不能把一条记录拆散。时刻归属不许动：同一条不许拆开，不同条不许并成一句。绝对不要一条一条原样抄下来。
【文风】：保留记录里的情绪信号，适度展开感受但不凭空捏造内心活动；用词讲究但不堆砌辞藻，不是散文，是一篇认真写过的日记随笔。多件事时详略分明，不要平均用力。`,
}

/** 整理这一版用的 system 提示；之后改稿也拿它当底 */
export function buildComposeSystemPrompt(style: ComposeStyle): string {
  return `${BASE_RULES}\n\n${STYLE_RULES[style]}`
}

/** 超过这个长度就截断，免得一篇旧日记把历史摘要挤爆 */
const HISTORY_ENTRY_CHARS = 300
const HISTORY_STAMP_CHARS = 80

function clip(text: string, max: number) {
  const body = text.trim()
  return body.length > max ? `${body.slice(0, max)}…` : body
}

/** 按天把备份里的记录聚起来，只留目标日期之前、区间内的未删除内容 */
export function buildHistoryDays(
  data: {
    entries: DiaryEntry[]
    stamps: DiaryStamp[]
    days: DiaryDay[]
    intakes: HealthIntake[]
    finance: FinanceEntry[]
  },
  from: string,
  to: string,
  excludeDateKey: string,
): ComposeDay[] {
  const inWindow = (dateKey: string) =>
    dateKey >= from && dateKey <= to && dateKey !== excludeDateKey
  const weatherByDay = new Map(
    data.days.filter((item) => inWindow(item.dateKey)).map((item) => [item.dateKey, item.weather]),
  )
  const buckets = new Map<string, ComposeDay>()

  function bucket(dateKey: string): ComposeDay {
    const found = buckets.get(dateKey)
    if (found) return found
    const created: ComposeDay = {
      dateKey,
      weather: weatherByDay.get(dateKey) ?? null,
      entries: [],
      stamps: [],
      intakes: [],
      finance: [],
    }
    buckets.set(dateKey, created)
    return created
  }

  for (const item of data.entries) {
    if (item.deletedAt !== null || !inWindow(item.dateKey)) continue
    bucket(item.dateKey).entries!.push(item)
  }
  for (const item of data.stamps) {
    if (item.deletedAt !== null || !inWindow(item.dateKey)) continue
    bucket(item.dateKey).stamps.push(item)
  }
  for (const item of data.intakes) {
    if (item.deletedAt !== null || !inWindow(item.dateKey)) continue
    bucket(item.dateKey).intakes.push(item)
  }
  for (const item of data.finance) {
    if (item.deletedAt !== null || !inWindow(item.dateKey)) continue
    bucket(item.dateKey).finance.push(item)
  }

  // 只有天气、没有别的内容的日子不值得占一行
  return [...buckets.values()]
    .filter(
      (day) =>
        (day.entries?.length ?? 0) > 0 ||
        day.stamps.length > 0 ||
        day.intakes.length > 0 ||
        day.finance.length > 0,
    )
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))
}

/** 最近的几篇日记正文，给模型当文风样例 */
export function buildStyleSamples(
  entries: DiaryEntry[],
  limit: number = STYLE_SAMPLE_COUNT,
): string[] {
  return entries
    .filter((item) => item.deletedAt === null && item.content.trim() !== '')
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0) || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((item) => clip(item.content, STYLE_SAMPLE_CHARS))
}

function formatFinance(item: FinanceEntry) {
  const note = item.note.trim()
  return `${item.name} ${item.amount} 元${note ? `（${note}）` : ''}`
}

const ALL_SOURCES: ComposeSource[] = ['stamps', 'health', 'finance']

function historyDayLines(day: ComposeDay, sources: ComposeSource[]): string[] {
  const states = parseWeather(day.weather)
  const lines = [
    `${formatDateCn(day.dateKey)} ${weekdayLabel(day.dateKey)}${
      states.length > 0 ? ` 天气：${weatherLabel(states)}` : ''
    }`,
  ]
  const entries = (day.entries ?? []).map((item) => clip(item.content, HISTORY_ENTRY_CHARS))
  if (entries.length > 0) lines.push(`  日记：${entries.join(' ／ ')}`)
  if (sources.includes('stamps') && day.stamps.length > 0) {
    lines.push(
      `  随记：${day.stamps
        .map((item) => `${item.time} ${clip(item.content, HISTORY_STAMP_CHARS)}`)
        .join('；')}`,
    )
  }
  if (sources.includes('health') && day.intakes.length > 0) {
    const total = Math.round(day.intakes.reduce((sum, item) => sum + item.kcal, 0))
    const names = day.intakes.map((item) => item.name).slice(0, 6).join('、')
    lines.push(`  摄入：合计 ${total} 千卡（${names}）`)
  }
  if (sources.includes('finance') && day.finance.length > 0) {
    lines.push(`  收支：${day.finance.map(formatFinance).slice(0, 6).join('；')}`)
  }
  return lines
}

/** 历史摘要；超出预算就整段丢掉更旧的日子 */
export function buildHistoryBlock(
  days: ComposeDay[],
  sources: ComposeSource[] = ALL_SOURCES,
  budget: number = HISTORY_BUDGET,
): string {
  const blocks: string[] = []
  let used = 0
  for (const day of days) {
    const block = historyDayLines(day, sources).join('\n')
    if (used + block.length > budget) break
    blocks.push(block)
    used += block.length + 1
  }
  return blocks.join('\n')
}

/** 把今天的事实、历史参考和文风样例拼成给模型看的那段话 */
export function buildComposeUserPrompt(context: ComposeContext): string {
  const { dateKey, today, sources } = context
  const states = parseWeather(today.weather)
  const lines = [`日期：${formatDateCn(dateKey)} ${weekdayLabel(dateKey)}`]
  // 没记天气就整行不写：写「天气：没记」的话，模型会把它当成一条事实写进日记里
  if (states.length > 0) lines.push(`天气：${weatherLabel(states)}`)

  if (sources.includes('stamps')) {
    lines.push('', '今天的随记（时刻 内容）：')
    if (today.stamps.length === 0) lines.push('（没有随记）')
    for (const stamp of today.stamps) {
      lines.push(`${stamp.time} ${stamp.content.trim() || '（当时没写内容）'}`)
    }
  }

  if (sources.includes('health')) {
    lines.push('', '今天的饮食摄入（时刻 名称 份量 热量）：')
    if (today.intakes.length === 0) lines.push('（没有记录）')
    for (const item of today.intakes) {
      lines.push(
        `${item.time} ${item.name} ${Math.round(item.grams)}g ${Math.round(item.kcal)} 千卡`,
      )
    }
  }

  if (sources.includes('finance')) {
    lines.push('', '今天的收支：')
    if (today.finance.length === 0) lines.push('（没有记录）')
    for (const item of today.finance) lines.push(formatFinance(item))
  }

  const history = buildHistoryBlock(context.history, sources)
  if (history !== '') {
    lines.push(
      '',
      '— 旧记录（更早的日子，只用来理解和呼应，不是今天发生的事）—',
      history,
    )
  }

  if (context.styleSamples.length > 0) {
    lines.push('', '文风参考（作者以前写的日记，只学语气与节奏，不要照抄）：')
    for (const sample of context.styleSamples) lines.push(`「${clip(sample, STYLE_SAMPLE_CHARS)}」`)
  }

  return lines.join('\n')
}

export interface ComposeResult {
  ok: boolean
  /** 写好的日记正文 */
  content: string
  /** 失败时的人话解释 */
  error: string
  ms: number
}

/** 把这一天的素材交给模型，拿回一篇日记草稿 */
export async function composeDiary(
  config: AiConfig,
  input: ComposeContext & { style: ComposeStyle },
): Promise<ComposeResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    // temperature 0.6 是"重组但不编事实"的甜点：比 0.7+ 稳（不会改数字地点），比 0.4 松（不套模板）；seed 每次换一个换切入点
    temperature: 0.6,
    seed: Math.floor(Math.random() * 2 ** 31),
    messages: [
      { role: 'system', content: buildComposeSystemPrompt(input.style) },
      { role: 'user', content: buildComposeUserPrompt(input) },
    ],
  })

  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  return { ok: true, content: stripMetaLine(content), error: '', ms: result.ms }
}

/** LLM 偶尔会在正文前加一行 meta（比如"以下是小学生口吻的日记："），剥掉它 */
export function stripMetaLine(text: string): string {
  const lines = text.split('\n')
  if (lines.length === 0) return text
  const first = lines[0].trim()
  const meta =
    /^(以下是|这是一篇|今天的日记|以下是今天|今天我|现在我|好的|好的，|好的,|好的、|我来帮|我来写|按.*风格|用.*口气).{0,40}[：:。.\s]*$/
  if (meta.test(first)) return lines.slice(1).join('\n').trim()
  return text
}
