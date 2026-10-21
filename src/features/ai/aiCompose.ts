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

/** 给 AI 的两种口气 */
export type ComposeStyle = 'natural' | 'child'

export const COMPOSE_STYLES: { id: ComposeStyle; label: string }[] = [
  { id: 'natural', label: '自然口语' },
  { id: 'child', label: '小学生腔' },
]

/** 两种口气都适用的规矩：这里写的是「怎么像一篇日记」，不是文风 */
const BASE_RULES = `你负责把一个人随手记下的零散记录，整理成一篇日记。

写法要求：
- 第一人称，像写给自己看的话，不要出现「你」，不要称呼读者
- 短句、口语，不要书面腔；不要小标题、不要 Markdown 符号、不要序号
- 按事情分成若干自然段，每段直接开始写，段首不要加任何符号
- 只写记录里真有的信息，不许编造人物、地点、情节、数字
- 给了天气就自然融进场景里；没给的信息一个字都别提，更不要说明「没记天气」这类缺失
- 不要「以下是」这类开场白，也不要额外的解释与总结段落
- 篇幅跟着记录的信息量走，不要硬凑长度

只输出日记正文本身，不要任何解释。`

const STYLE_RULES: Record<ComposeStyle, string> = {
  natural: `语气自然、平实，像一个成年人随手写下的日记。`,
  child: `用小学生写日记的口气：句子更短、用词更简单，开心或者不开心可以很直白地写出来。`,
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
