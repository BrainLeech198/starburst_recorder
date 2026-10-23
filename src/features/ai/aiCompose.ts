/**
 * 「把随记整理成一篇日记」的提示词与调用。
 *
 * 单独一个文件的原因：提示词是要反复调的东西，调它的时候不该动界面代码。
 */
import type { DiaryStamp } from '@/core/db/schema'
import { formatDateCn, weekdayLabel } from '@/core/utils/dateKey'
import { parseWeather, weatherLabel } from '@/features/diary/weather'
import { chat, explainFailure, pickReply } from './aiClient'
import type { AiConfig } from './aiConfig'
import type { MessageKey } from '@/shared/i18n/messages/zh'

/** 给 AI 的三种口气 */
export type ComposeStyle = 'natural' | 'child' | 'polished'

export const COMPOSE_STYLES: { id: ComposeStyle; labelKey: MessageKey }[] = [
  { id: 'natural', labelKey: 'ai.styleNatural' },
  { id: 'child', labelKey: 'ai.styleChild' },
  { id: 'polished', labelKey: 'ai.stylePolished' },
]

/** 三种口气都适用的规矩：这里写的是「怎么像一篇日记 + 怎么加工」 */
const BASE_RULES = `你负责把一个人随手记下的零散记录，整理成一篇日记。

加工原则（不是"原文照搬"，是"用记录做素材写日记"）：
- 记录里的**事实**不能动：人物、地点、数字、发生了什么——这些必须保留，不许编造
- 但**表达**完全可以重组：换词、换顺序、合并几条、拆成几段、加过渡句、调整描述角度——这些都是允许的，而且是应该做的
- 正确的做法：把几条零碎记录揉成一段连贯的叙述；错误的做法：一条一条原样抄下来，中间加换行就完事

写法要求：
- 第一人称，像写给自己看的话，不要出现「你」，不要称呼读者
- 按事情的前因后果串成一条线，段落之间要有衔接，不要一条一条生硬罗列
- 每段直接开始写，段首不要加任何符号
- 给了天气就自然融进场景里；没给的信息一个字都别提
- 篇幅跟着记录的信息量走，不要硬凑长度
- 每次写法不要跟前一次一模一样——换个切入顺序、换个动词、换个节奏都行，别让读起来像套模板

硬性禁止：
- 不要输出「以下是」「这是一篇」「今天的日记」这类**开场白**
- 不要在正文之后加任何**解释、说明、总结**
- 只输出日记正文本身，什么都不要额外加`

const STYLE_RULES: Record<ComposeStyle, string> = {
  natural: `【加工动作】：把几条零碎记录重组为连贯的叙述——换词、换语序、合并相关的几条、加一句半路上的碎碎念式过渡。绝对不要一条一条原样抄下来。
【文风】：句子长短都有，像成年人随手写下来的，偶尔有一两句口语化的碎碎念（比如"怎么又这样"），不刻意工整，避免书面腔和排比句。`,

  child: `【加工动作】：把每条记录改写成短句，合并时用"然后"、"后来"串起来。记录里的形容词换成小学生会用的简单词（"好吃"代替"美味"，"开心"代替"愉悦"）。绝对不要一条一条原样抄下来。
【文风】：句子短，用词简单，开心和不开心都直白写出来；每写一件事就换一段，段落之间空一行。
【特别注意】直接写正文第一句，不要先写"今天我…"或者任何解释性的第一句——直接从发生的事开始。`,

  polished: `【加工动作】：把几条记录重组为一段完整的叙事——找一条主线（比如"今天的心情"或"一件事的来龙去脉"），其他几笔围绕主线服务，删掉无关的碎话，把相关的合并，段落之间用回忆、情绪或动作自然衔接。绝对不要一条一条原样抄下来。
【文风】：保留记录里的情绪信号，适度展开感受但不凭空捏造内心活动；用词讲究但不堆砌辞藻，不是散文，是一篇认真写过的日记随笔。多件事时详略分明，不要平均用力。`,
}

/** 把一天的事实拼成给模型看的那段话 */
function buildUserPrompt(dateKey: string, weather: string | null | undefined, stamps: DiaryStamp[]) {
  const states = parseWeather(weather)
  const lines = [`日期：${formatDateCn(dateKey)} ${weekdayLabel(dateKey)}`]
  // 没记天气就整行不写：写「天气：没记」的话，模型会把它当成一条事实写进日记里
  if (states.length > 0) lines.push(`天气：${weatherLabel(states)}`)
  lines.push('', '这一天随手记下的事（时间 内容）：')
  for (const stamp of stamps) {
    lines.push(`${stamp.time} ${stamp.content.trim() || '（当时没写内容）'}`)
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

/** 把这一天的随记交给模型，拿回一篇日记草稿 */
export async function composeDiary(
  config: AiConfig,
  input: {
    dateKey: string
    weather: string | null | undefined
    stamps: DiaryStamp[]
    style: ComposeStyle
  },
): Promise<ComposeResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    // temperature 0.8 比默认稍微松一点，避免每次都一样；seed 每次换一个，跳出模板重复
    temperature: 0.8,
    seed: Math.floor(Math.random() * 2 ** 31),
    messages: [
      { role: 'system', content: `${BASE_RULES}\n\n${STYLE_RULES[input.style]}` },
      { role: 'user', content: buildUserPrompt(input.dateKey, input.weather, input.stamps) },
    ],
  })

  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  return { ok: true, content: stripMetaLine(content), error: '', ms: result.ms }
}

/** LLM 偶尔会在正文前加一行 meta（比如"以下是小学生口吻的日记："），剥掉它 */
function stripMetaLine(text: string): string {
  const lines = text.split('\n')
  if (lines.length === 0) return text
  const first = lines[0].trim()
  const meta = /^(以下是|这是一篇|今天的日记|以下是今天|今天我|现在我|好的|好的，|好的,).{0,30}[：:。.\s]*$/
  if (meta.test(first)) return lines.slice(1).join('\n').trim()
  return text
}
