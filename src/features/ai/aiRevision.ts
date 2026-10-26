/**
 * 一轮一轮地改稿：AI 整理和 AI 润色共用。
 *
 * 第一次生成之后，用户可以直接说「第二段短一点」「语气再轻松些」，
 * 模型基于眼前这一版改，每次回一整篇。这里只负责把对话拼成 messages，
 * 以及发请求——界面怎么摆由各自的弹窗决定。
 */
import type { ChatMessage } from '@/platform/desktop'
import { chat, explainFailure, pickReply } from './aiClient'
import type { AiConfig } from './aiConfig'
import { stripMetaLine } from './aiCompose'

/** 用户提过的一次要求，以及按它改出来的正文 */
export interface RevisionTurn {
  request: string
  content: string
}

/** 第一次请求的固定部分：整理是素材 + 整理规矩，润色是原文 + 润色规矩 */
export interface RevisionSeed {
  /** 第一次给模型的 system 提示 */
  systemPrompt: string
  /** 第一次给模型的用户输入 */
  seedUser: string
}

export interface RevisionInput extends RevisionSeed {
  /** 眼前这一版正文，可能已经被用户手改过 */
  draft: string
  turns: RevisionTurn[]
  request: string
}

export interface RevisionResult {
  ok: boolean
  content: string
  error: string
  ms: number
}

export const REVISION_RULES = `现在进入改稿环节。用户会对这一版正文提出修改要求。
- 要求会一轮一轮提，每一轮都基于上一版改
- 按这一轮的要求改，改完输出**完整**的正文，不要只给改动的句子或片段
- 没有被要求改的地方保持原样，不要借机重写整篇
- 仍然遵守前面的所有规矩：素材里的事实不许编造，不加标题、开场白、解释和总结`

/** 把素材、当前正文、之前每一轮和这次的要求拼成对话 */
export function buildRevisionMessages(input: RevisionInput): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: `${input.systemPrompt}\n\n${REVISION_RULES}` },
    { role: 'user', content: input.seedUser },
  ]

  if (input.turns.length === 0) {
    messages.push({ role: 'assistant', content: input.draft })
  } else {
    for (const turn of input.turns) {
      messages.push({ role: 'user', content: turn.request })
      messages.push({ role: 'assistant', content: turn.content })
    }
    // 手改过的话得把眼前这版交给模型，否则它还是接着上一轮的输出改
    if (input.draft.trim() !== input.turns[input.turns.length - 1].content.trim()) {
      messages.push({ role: 'user', content: `我手动改了，现在的正文是：\n${input.draft}` })
    }
  }

  const request = input.request.trim()
  if (request !== '') messages.push({ role: 'user', content: request })
  return messages
}

/** 按用户这一轮的要求改稿，返回完整的新正文 */
export async function reviseText(
  config: AiConfig,
  input: RevisionInput,
  temperature = 0.4,
): Promise<RevisionResult> {
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    temperature,
    messages: buildRevisionMessages(input),
  })
  const content = pickReply(result.body)
  if (!result.ok || content === '') {
    return { ok: false, content: '', error: explainFailure(result, config.baseUrl), ms: result.ms }
  }
  return { ok: true, content: stripMetaLine(content), error: '', ms: result.ms }
}
