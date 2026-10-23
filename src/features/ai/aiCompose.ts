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

/** 三种口气都适用的规矩：这里写的是「怎么像一篇日记」，不是文风 */
const BASE_RULES = `你负责把一个人随手记下的零散记录，整理成一篇日记。

写法要求：
- 第一人称，像写给自己看的话，不要出现「你」，不要称呼读者
- 按事情的前因后果串成一条线，段落之间要有衔接，不要一条一条生硬罗列
- 每段直接开始写，段首不要加任何符号
- 只写记录里真有的信息，不许编造人物、地点、情节、数字；如果哪件事没前因没后果，就顺着记录给的那条写，不要补
- 给了天气就自然融进场景里；没给的信息一个字都别提
- 不要「以下是」这类开场白，也不要额外的解释与总结段落
- 篇幅跟着记录的信息量走，不要硬凑长度
- 每次写法不要跟前一次一模一样——换个切入顺序、换个动词、换个节奏都行，别让读起来像套模板

只输出日记正文本身，不要任何解释。`

const STYLE_RULES: Record<ComposeStyle, string> = {
  natural: `语气像一个成年人随手写下来的：句子长短都有，想到哪写到哪，不刻意追求工整。避免书面腔和排比句。`,
  child: `用小学生写日记的口气：句子短，用词简单，开心和不开心都直白地写出来；段落短，段落之间空一行。`,
  polished: `在不编造、不虚构的前提下，把内容写得更有看点：
- 段落之间用回忆、情绪或动作自然衔接，读起来像一段完整的叙事，而不是一串流水账
- 保留记录里的情绪信号，适度展开感受，但不要凭空捏造内心活动
- 用词讲究一点，但不要堆砌辞藻，也不要写散文
- 如果一天里有多件事，找一个最值得写的作为主线，其他几笔带过，不要平均用力`,
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
  return { ok: true, content, error: '', ms: result.ms }
}
