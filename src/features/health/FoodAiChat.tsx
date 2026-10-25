/**
 * 新增食物里的「和 AI 聊聊」。
 *
 * 不是一个表单的替代品，而是旁边的一张小对话：用户说说吃什么，AI 追问做法和份量，
 * 问够了就给出每 100g 的热量与三大营养素，点一下填进上面的表单再自己微调。
 *
 * 做成内嵌面板而不是再开一层弹窗：FoodForm 本来就常常开在弹窗里，
 * 再叠一层 Modal，焦点陷阱和 Esc 会互相打架。
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '@/shared/i18n/context'
import { INPUT } from '@/shared/ui/inputStyles'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import type { ChatMessage } from '@/platform/desktop'
import type { FoodDraft } from './FoodForm'
import { parseFoodAnalysis } from './foodVision'

/** 最多追问几轮；到点必须给结论，免得用户被一直问下去 */
const MAX_ROUNDS = 8

const SYSTEM_PROMPT = `你是一位营养估算助手，正在帮用户把一道食物估成可以存进食物库的数据。

目标：尽量准。做法（油炸、清蒸、红烧）、放油和糖的多少、配料比例、份量都会明显改变营养。

用户可能直接给出配料和份量（例如「1拳米饭、一个卤鸡腿、一个卤蛋」）。这时必须：
- 逐项采用用户给的配料与份量，不许漏掉其中任何一项，也不许换成别的食材；
- 先逐项估这一份的热量，再加总；
- 整份总重量按各成分克数相加，per100g 由合计折算，不要另估一个不相干的数；
- name 用整道菜的名字，不要加括号里的别名。

提问规则：
1. 信息不够时，每次只问一个最关键的问题，用中文，简短口语化。
2. 先接住用户上一句，再问下一个问题，例如「鸡腿饭的话，鸡腿是卤的还是炸的？」。
3. 信息不够时可以多问几轮（最多 8 轮），能从常识推断的就别问，不要机械列清单。
4. 用户答非所问或闲聊，用一句话温和地拉回来，不要跟着跑题。
5. 当系统提示轮次已到上限时，必须直接给结论，不要再提问。

结论格式：纯 JSON，二选一，不要 markdown、不要解释。
- 还要问：{"question":"先接住上一句，再问一个问题"}
- 给结论：{"name":"食物名","per100g":{"kcal":165,"protein":2.6,"carbs":25.9,"fat":0.3},"servingName":"一份","servingGrams":440,"parts":[{"name":"米饭","grams":150,"kcal":174},{"name":"卤鸡腿","grams":110,"kcal":200}],"note":"一句中文依据，例如按家常做法估"}
营养一律按每 100g，kcal 和 g；servingName / servingGrams 尽量给，实在没有就填空字符串。
parts 列出这一份里的每一项、克数和热量，让用户能核对；实在拆不出来就省略 parts。`

type Turn = { role: 'ai' | 'user'; text: string }

/** 结论里的「按份拆解」明细，只用来让用户核对，不回填表单 */
interface ProposalPart {
  name: string
  grams: number
  kcal: number
}

interface Proposal extends FoodDraft {
  note: string
  parts: ProposalPart[]
}

/** 模型偶尔把 JSON 包进代码块，先剥掉 */
function stripFence(text: string) {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

/** 回复是提问时，把 question 字段或原文拿出来 */
function questionOf(raw: string): string {
  const text = stripFence(raw)
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    if (typeof data.question === 'string' && data.question.trim() !== '') {
      return data.question.trim()
    }
  } catch {
    // 不是 JSON 就原样显示，别让对话卡死
  }
  return text
}

/** 结论里的依据单独拿出来，展示在结果卡上 */
function noteOf(raw: string): string {
  try {
    const json = stripFence(raw).match(/\{[\s\S]*\}/)?.[0]
    if (!json) return ''
    const data = JSON.parse(json) as Record<string, unknown>
    return typeof data.note === 'string' ? data.note.trim() : ''
  } catch {
    return ''
  }
}

/** 结论里按份拆开的明细；模型没给或给坏了就当没有 */
function partsOf(raw: string): ProposalPart[] {
  try {
    const json = stripFence(raw).match(/\{[\s\S]*\}/)?.[0]
    if (!json) return []
    const data = JSON.parse(json) as Record<string, unknown>
    if (!Array.isArray(data.parts)) return []
    return data.parts
      .map((part) => {
        const record = part as Record<string, unknown>
        const name = typeof record.name === 'string' ? record.name.trim() : ''
        const grams = Number(record.grams)
        const kcal = Number(record.kcal)
        return {
          name,
          grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : 0,
          kcal: Number.isFinite(kcal) && kcal >= 0 ? Math.round(kcal) : 0,
        }
      })
      .filter((part) => part.name !== '' && part.grams > 0)
  } catch {
    return []
  }
}

/** 把一条模型回复收成「提问」或「结论」，解析交给 foodVision，规则保持一致 */
function parseReply(raw: string): { question?: string; proposal?: Proposal } {
  const guess = parseFoodAnalysis(raw)
  if (guess) {
    return {
      proposal: {
        name: guess.name,
        kcal: guess.kcal,
        protein: guess.protein,
        carbs: guess.carbs,
        fat: guess.fat,
        servingName: guess.servingName,
        servingGrams: guess.servingGrams,
        note: noteOf(raw),
        parts: partsOf(raw),
      },
    }
  }
  return { question: questionOf(raw) }
}

export default function FoodAiChat({
  open = true,
  initialName,
  onApply,
  onClose,
}: {
  /** 面板是否展开；收起时保留对话，重新展开滚回最近一条 */
  open?: boolean
  /** 表单里已经填的名字，打开时直接拿去问 */
  initialName?: string
  onApply: (draft: FoodDraft) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const config = loadAiConfig()
  const configured = isConfigured(config)

  const [turns, setTurns] = useState<Turn[]>([])
  const answeredCount = turns.filter((turn) => turn.role === 'user').length
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // StrictMode 下挂载 effect 会跑两遍，没有这道闸门就会一口气问两遍
  const startedRef = useRef(false)

  useEffect(() => {
    if (!configured || startedRef.current) return
    startedRef.current = true
    const name = initialName?.trim() ?? ''
    if (name !== '') void ask(`我想估一下「${name}」的营养`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, loading, proposal, open])

  async function ask(answer?: string) {
    setLoading(true)
    setError('')
    if (answer !== undefined) {
      setTurns((current) => [...current, { role: 'user', text: answer }])
    }

    const history: ChatMessage[] = turns.map(
      (turn) => ({ role: turn.role === 'ai' ? 'assistant' : 'user', content: turn.text } as ChatMessage),
    )
    if (answer !== undefined) history.push({ role: 'user', content: answer })

    const answered = turns.filter((turn) => turn.role === 'user').length + (answer !== undefined ? 1 : 0)
    const atLimit = answered >= MAX_ROUNDS

    async function request(force: boolean) {
      const state =
        atLimit || force
          ? `【本轮状态】用户已回答 ${answered} 轮，轮次已到上限。本轮必须直接输出结论 JSON，不要再提问。`
          : answered === 0
            ? '【本轮状态】这是第一轮。先判断信息够不够，不够就只问一个最关键的问题。'
            : `【本轮状态】用户已回答 ${answered} 轮。信息够估就收尾给结论，不够就只再问一个问题。`
      return chat({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\n${state}` }, ...history],
        temperature: 0.3,
      })
    }

    let result = await request(false)
    if (!result.ok) {
      setLoading(false)
      setError(explainFailure(result, config.baseUrl))
      return
    }

    let reply = parseReply(pickReply(result.body))
    // 到上限还在问，就再逼一次
    if (atLimit && reply.question && !reply.proposal) {
      result = await request(true)
      if (!result.ok) {
        setLoading(false)
        setError(explainFailure(result, config.baseUrl))
        return
      }
      reply = parseReply(pickReply(result.body))
    }
    setLoading(false)

    if (reply.proposal) {
      setProposal(reply.proposal)
    } else if (reply.question) {
      const question = reply.question
      setTurns((current) => [...current, { role: 'ai', text: question }])
    } else {
      setError(t('foods.aiFailed'))
    }
  }

  function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    void ask(text)
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-sm text-fg">{t('foods.aiTitle')}</p>
          <p className="m-0 mt-0.5 text-xs text-muted">{t('foods.aiDesc')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('foods.aiClose')}
        </button>
      </div>

      {!configured ? (
        <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
          {t('foods.aiNoConfig')}
          <div className="mt-2">
            <Link to="/me/agent/ai" className="text-brand underline">
              {t('foods.aiGoSettings')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1"
            style={{ minHeight: turns.length === 0 ? 0 : 120 }}
          >
            {turns.length === 0 && (
              <div className="rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm text-muted">
                {t('foods.aiGreeting')}
              </div>
            )}
            {turns.map((turn, index) => (
              <div
                key={index}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  turn.role === 'ai'
                    ? 'self-start rounded-tl-sm bg-surface text-fg'
                    : 'self-end rounded-tr-sm bg-brand/10 text-fg'
                }`}
              >
                {turn.text}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm text-muted">
                {t('foods.aiThinking')}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-danger px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}
          </div>

          {proposal ? (
            <div className="rounded-xl border border-brand/40 bg-surface p-3">
              <p className="m-0 text-xs text-muted">{t('foods.aiResult')}</p>
              <p className="m-0 mt-1 text-sm text-fg">{proposal.name}</p>
              <div className="mt-1 grid grid-cols-4 gap-1 text-center text-xs">
                {[
                  { label: t('foods.kcal'), value: proposal.kcal },
                  { label: t('foods.protein'), value: proposal.protein },
                  { label: t('foods.carbs'), value: proposal.carbs },
                  { label: t('foods.fat'), value: proposal.fat },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-surface-2 py-1">
                    <span className="block text-[10px] text-muted">{item.label}</span>
                    <span className="block font-medium tabular-nums text-fg">{item.value}</span>
                  </div>
                ))}
              </div>
              {proposal.servingName && proposal.servingGrams && (
                <>
                  <p className="m-0 mt-1 text-xs text-muted">
                    {t('foods.aiServing', {
                      name: proposal.servingName,
                      grams: proposal.servingGrams,
                    })}
                  </p>
                  {/* 每 100g 容易看错，这里顺手把整份的合计也算出来 */}
                  <p className="m-0 mt-0.5 text-xs text-fg">
                    {t('foods.aiServingTotal', {
                      kcal: Math.round((proposal.kcal * proposal.servingGrams) / 100),
                      protein: Math.round(proposal.protein * proposal.servingGrams) / 100,
                    })}
                  </p>
                </>
              )}
              {proposal.parts.length > 0 && (
                <div className="mt-1">
                  <p className="m-0 text-[11px] text-muted">{t('foods.aiParts')}</p>
                  <ul className="m-0 mt-0.5 list-none space-y-0.5 p-0">
                    {proposal.parts.map((part, index) => (
                      <li
                        key={`${part.name}-${index}`}
                        className="flex justify-between gap-2 text-xs text-muted"
                      >
                        <span className="min-w-0 truncate text-fg">{part.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {t('foods.aiPartLine', { grams: part.grams, kcal: part.kcal })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {proposal.note !== '' && (
                <p className="m-0 mt-1 text-xs text-muted">
                  {t('foods.aiNote', { note: proposal.note })}
                </p>
              )}
              <p className="m-0 mt-1 text-[11px] text-muted">{t('foods.aiApplyHint')}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onApply({
                      name: proposal.name,
                      kcal: proposal.kcal,
                      protein: proposal.protein,
                      carbs: proposal.carbs,
                      fat: proposal.fat,
                      servingName: proposal.servingName,
                      servingGrams: proposal.servingGrams,
                    })
                  }
                  className={SOLID_BUTTON}
                >
                  {t('foods.aiApply')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // 只是收起结果卡、回到输入态，让用户自己补充信息；
                    // 以前会代发一句「再多问我几个问题吧」，看起来像用户在说话
                    setProposal(null)
                    requestAnimationFrame(() => inputRef.current?.focus())
                  }}
                  className={OUTLINE_BUTTON}
                >
                  {t('foods.aiKeepAsking')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') send()
                  }}
                  placeholder={t('foods.aiPlaceholder')}
                  className={`${INPUT} flex-1`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className={SOLID_BUTTON}
                >
                  {t('foods.aiSend')}
                </button>
              </div>
              <p className="m-0 text-center text-[11px] text-muted">
                {t('foods.aiProgress', { count: answeredCount, max: MAX_ROUNDS })}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
