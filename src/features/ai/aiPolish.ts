/**
 * AI 润色：只理顺文字，不改内容。
 *
 * 和「AI 整理」不同，这里不重组事实，只做标点、断句、去重复和语序；
 * 日记里的时间、人名、地名、数字都要原样保留。
 */
import { chat, explainFailure, pickReply } from './aiClient'
import type { AiConfig } from './aiConfig'

export interface PolishResult {
  ok: boolean
  content: string
  error: string
}

/** 第一次润色的规矩；之后接着提要求时，在同一套规矩上追加改稿规则 */
export const POLISH_SYSTEM_PROMPT = `你是一位中文文字编辑，负责润色日记正文。
要求：
1. 只调整标点、断句、重复用词和语序，让文字更通顺自然。
2. 不增删事实：人名、地名、时间、数字、事件必须原样保留。
3. 保持作者原有的语气和人称，不要改成书面报告或模板腔。
4. 保持原来的段落划分和换行，不要加标题、不要解释。
5. 直接输出润色后的正文，不要输出任何前后说明。`

export async function polishDiary(config: AiConfig, text: string): Promise<PolishResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    temperature: 0.3,
    messages: [
      { role: 'system', content: POLISH_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  })
  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl) }
  }
  return { ok: true, content, error: '' }
}
