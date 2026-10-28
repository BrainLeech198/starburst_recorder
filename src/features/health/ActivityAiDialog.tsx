/**
 * 「让 AI 帮我判断活动量」的问答弹窗。
 *
 * 跟手动填「每周几次 / 每次多久」不同，这里走真正的多轮对话：AI 每次只问一个问题，
 * 下一个问题跟上一轮回答走，问到它觉得够了就给一个建议档位，用户确认后才写入。
 *
 * 为了把「问问题」和「给结论」两种回复统一解析，约定 AI 只回 JSON：
 *   - 还在问：{ "question": "..." }
 *   - 问完了：{ "activity": "sedentary|light|moderate|high", "reason": "..." }
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { HealthActivity } from '@/core/db/schema'
import { ACTIVITY_FACTORS } from './healthMath'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import type { ChatMessage } from '@/platform/desktop'
import type { MessageKey } from '@/shared/i18n/messages/zh'

/** 最多问几轮就得收尾，硬上限，防止 AI 无限追问或被用户拖住 */
const MAX_ROUNDS = 8

const SYSTEM_PROMPT = `你是一位帮用户判断日常活动量的健身助手，正在做一次简短问诊。

活动量分四档（括号里是系数）：
- sedentary 久坐（×1.2）：基本坐着，很少或几乎不运动
- light 轻度（×1.375）：每周 1–3 次轻运动，或日常有少量走动
- moderate 中度（×1.55）：每周 3–5 次中等强度运动
- high 高强度（×1.725）：每周 6–7 次运动，或从事体力劳动

判断依据：工作或学习性质、通勤方式、日常走动量、运动的频率与强度。

提问规则：
1. 每次只问一个问题，用中文，简短口语化。
2. 追问前先用半句话接住上一轮的答案，让用户知道你听懂了。例如用户说「我是学生」，
   你就说「学生的话平时在校园里走动通常不少——」，再问下一个问题。
3. 不要按固定清单机械提问。已经答过的不要再问；能从已有回答推断出来的，就别问。
4. 一般问 3–8 轮，信息够判断了就立刻收尾，最多不超过 8 轮。不要为了问而问。
5. 如果用户答非所问、或者扯到和活动量无关的话题，用一句话温和地把话题拉回来，
   不要跟着跑题，也不要顺着无关话题继续展开。
6. 当系统提示已经问满轮次时，必须直接给结论，不要再提问。

输出格式：你的回复必须是纯 JSON，二选一。
- 还要问：{"question": "先接住上一轮的那半句话，再问你的问题"}
- 可以收尾：{"activity": "sedentary|light|moderate|high", "reason": "一句中文理由，说明判断依据"}
不要输出 JSON 以外的任何文字、解释或 markdown。`

type Turn = { role: 'ai' | 'user'; text: string }

interface Proposal {
  activity: HealthActivity
  reason: string
}

/** 从模型回复里抠 JSON；模型偶尔会套 ```json 代码块，先剥掉 */
function parseReply(raw: string): { question?: string; activity?: HealthActivity; reason?: string } {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const obj = JSON.parse(text) as Record<string, unknown>
    if (typeof obj.activity === 'string') {
      const activity = obj.activity as HealthActivity
      if (['sedentary', 'light', 'moderate', 'high'].includes(activity)) {
        return { activity, reason: typeof obj.reason === 'string' ? obj.reason : '' }
      }
    }
    if (typeof obj.question === 'string') return { question: obj.question }
  } catch {
    // 解析失败就把整段当问题显示，别让对话卡死
  }
  return { question: raw }
}

const ACTIVITY_LABEL: Record<HealthActivity, MessageKey> = {
  sedentary: 'profile.activitySedentary',
  light: 'profile.activityLight',
  moderate: 'profile.activityModerate',
  high: 'profile.activityHigh',
}

export default function ActivityAiDialog({
  note,
  onApply,
  onClose,
}: {
  /** 档案里的「情况说明」：AI 判断时唯一的背景信息，标签只是往这里填字的快捷方式 */
  note?: string
  onApply: (activity: HealthActivity) => void
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
  // StrictMode 下挂载 effect 会跑两遍，没有这道闸门就会一口气问两句话
  const startedRef = useRef(false)

  // 打开就问第一个问题：省得用户再点一次「开始」
  useEffect(() => {
    if (!configured || startedRef.current) return
    startedRef.current = true
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, loading, proposal])

  async function ask(answer?: string) {
    setLoading(true)
    setError('')
    if (answer !== undefined) {
      setTurns((current) => [...current, { role: 'user', text: answer }])
    }

    // 用当前渲染的 turns 作历史，再把这一轮的回答补上
    const history: ChatMessage[] = turns.map(
      (m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text } as ChatMessage),
    )
    if (answer !== undefined) history.push({ role: 'user', content: answer })

    const answered = turns.filter((m) => m.role === 'user').length + (answer !== undefined ? 1 : 0)
    const atLimit = answered >= MAX_ROUNDS

    // 每轮把「已经答了几轮」告诉模型，让它自己判断该收尾还是继续问
    async function request(force: boolean) {
      const state =
        atLimit || force
          ? `【本轮状态】用户已回答 ${answered} 轮，轮次已达上限。本轮必须直接输出 {"activity","reason"} 结论，不要再提任何问题。`
          : answered === 0
            ? '【本轮状态】这是第一个问题。挑最关键的一个问，一次只问一件事。'
            : `【本轮状态】用户已回答 ${answered} 轮，这是第 ${answered + 1} 轮。信息够判断就收尾给结论，不够就只再问一个最关键的问题。`
      // 档案里的「情况说明」是唯一的背景资料，已经写明的事就别再问
      const context = note?.trim()
        ? `\n\n【用户档案里的情况说明】\n${note.trim()}\n其中已经写明的内容不要再问。`
        : ''
      return chat({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\n${state}${context}` }, ...history],
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
    // 到上限还在问，就再逼一次，免得对话无限拖下去
    if (atLimit && reply.question && !reply.activity) {
      result = await request(true)
      if (!result.ok) {
        setLoading(false)
        setError(explainFailure(result, config.baseUrl))
        return
      }
      reply = parseReply(pickReply(result.body))
    }
    setLoading(false)

    const activity = reply.activity
    if (activity) {
      const label = t(ACTIVITY_LABEL[activity])
      setProposal({ activity, reason: reply.reason ?? '' })
      setTurns((current) => [
        ...current,
        {
          role: 'ai',
          text: reply.reason
            ? t('health.aiActivitySuggestion', { label, reason: reply.reason })
            : t('health.aiActivitySuggestionShort', { label }),
        },
      ])
    } else if (reply.question) {
      setTurns((current) => [...current, { role: 'ai', text: reply.question! }])
    } else {
      setError(t('health.aiActivityUnreadable'))
    }
  }

  function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    void ask(text)
  }

  return (
    <Modal
      size="sm"
      label={t('profile.activityAiTitle')}
      onClose={onClose}
      panelClassName="flex flex-col"
    >
      <div className="text-sm font-medium">{t('profile.activityAiTitle')}</div>
      <p className="mt-1 text-xs text-muted">{t('profile.activityAiDesc')}</p>

      {!configured ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
          {t('profile.activityAiNoConfig')}
          <div className="mt-2">
            <Link to="/me/agent/ai" className="text-brand underline" onClick={onClose}>
              {t('profile.activityAiGoSettings')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 用 flex 的弹性高度而不是写死 minHeight：小屏/键盘弹出时面板会被
              max-height 卡住，固定最小高度会把输入框顶到可视区外面 */}
          <div ref={scrollRef} className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '50vh' }}>
            {turns.map((turn, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  turn.role === 'ai'
                    ? 'self-start rounded-tl-sm bg-surface-2 text-fg'
                    : 'ml-auto rounded-tr-sm bg-brand/10 text-fg'
                }`}
              >
                {turn.text}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm text-muted">
                {t('profile.activityAiThinking')}
              </div>
            )}
            {error && (
              <ErrorNote>{error}</ErrorNote>
            )}
          </div>

          {proposal ? (
            <div className="mt-3 rounded-xl border border-brand/40 bg-brand/5 p-3">
              <div className="text-sm text-fg">
                {t('profile.activityAiProposal', {
                  name: t(ACTIVITY_LABEL[proposal.activity]),
                  factor: ACTIVITY_FACTORS[proposal.activity],
                })}
              </div>
              {proposal.reason && (
                <div className="mt-1 text-xs text-muted">{t('profile.activityAiReason', { reason: proposal.reason })}</div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onApply(proposal.activity)}
                  className={SOLID_BUTTON}
                >
                  {t('profile.activityAiApply')}
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
                  {t('profile.activityAiKeepAsking')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                  placeholder={t('profile.activityAiPlaceholder')}
                  className={`${INPUT} flex-1`}
                  disabled={loading}
                />
                <button type="button" onClick={send} disabled={loading || !input.trim()} className={SOLID_BUTTON}>
                  {t('profile.activityAiSend')}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-muted">
                {t('profile.activityAiProgress', { count: answeredCount, max: MAX_ROUNDS })}
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
