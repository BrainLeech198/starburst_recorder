/**
 * 「问ai一下」弹窗：预设问题 + 随便问，自带当天数据上下文和本会话的对话记忆。
 *
 * 只问答、不写库——写数据的能力以后归「助手」（带确认预览的那套），这里先把「问」做顺。
 * 出口还是 aiClient.chat()，AI 提示词按项目惯例固定中文（和 aiCompose、导出一样）。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import type { HealthIntake, HealthProfile } from '@/core/db/schema'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { INPUT } from '@/shared/ui/inputStyles'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import type { DayTargets, Macros } from './healthMath'
import { formatNum } from './healthMath'

interface Turn {
  role: 'user' | 'ai'
  text: string
}

/** 预设问题：点一下就发出去，长辈不用打字 */
const PRESETS = [
  { key: 'askAi.presetFit', text: '这一笔吃下去合适吗？' },
  { key: 'askAi.presetNext', text: '推荐接下来吃什么？' },
  { key: 'askAi.presetDay', text: '今天吃得怎么样？' },
  { key: 'askAi.presetLeft', text: '还剩多少额度？' },
  { key: 'askAi.presetSmart', text: '你看着说。' },
] as const

function line(value: number | null | undefined) {
  return value === null || value === undefined ? '暂无' : formatNum(value)
}

/** 当天数据拼成一段中文摘要，塞进用户消息里——AI 不用自己来查库 */
function buildContext(input: {
  dayKey: string
  intakes: HealthIntake[]
  totals: Macros
  targets: DayTargets
  derived: number | null | undefined
  remaining: number | null
  profile: HealthProfile | undefined
}) {
  const parts: string[] = []
  parts.push('日期：' + input.dayKey)
  parts.push('今天记下的摄入（时间 名字 克数 千卡 蛋白g）：')
  if (input.intakes.length === 0) {
    parts.push('（还没记）')
  } else {
    for (const item of input.intakes) {
      parts.push(
        '- ' +
          item.time +
          ' ' +
          item.name +
          ' ' +
          item.grams +
          'g ' +
          formatNum(item.kcal) +
          '千卡 蛋白' +
          formatNum(item.protein) +
          'g',
      )
    }
  }
  parts.push(
    '合计：' +
      formatNum(input.totals.kcal) +
      '千卡，蛋白' +
      formatNum(input.totals.protein) +
      'g，碳水' +
      formatNum(input.totals.carbs) +
      'g，脂肪' +
      input.totals.fat +
      'g',
  )
  parts.push(
    '目标口径：目标热量 ' +
      line(input.targets.targetKcal) +
      ' 千卡；参考TDEE（公式估算）' +
      line(input.targets.tdee) +
      ' 千卡；推算TDEE（真实数据反推）' +
      line(input.derived) +
      ' 千卡',
  )
  parts.push('距离目标还剩：' + line(input.remaining) + ' 千卡（负数是超了）')
  const p = input.profile
  if (p) {
    parts.push(
      '用户档案：' +
        (p.sex === 'male' ? '男' : p.sex === 'female' ? '女' : '性别未填') +
        '，' +
        line(p.age) +
        '岁，' +
        line(p.heightCm) +
        'cm，' +
        line(p.weightKg) +
        'kg；计划：' +
        (p.plan || '未选') +
        (p.note ? '；情况说明：' + p.note : ''),
    )
  }
  return parts.join('\n')
}

/** 每次请求换个 seed，避免回答套模板；放在组件外，别在渲染期算 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

const SYSTEM_PROMPT = [
  '你是「星芒记录者」的健康助手，正在帮用户看今天的饮食。',
  '说话直接、给数字、给能执行的建议：不要空话，不要说教，不要反复唠叨同一件事。',
  '判断要基于消息里给的真实数据；数据不够就先说缺什么，不要编。',
  '回答尽量简短（200 字以内），用用户提问的语言。',
].join('\n')

export default function AskAiDialog({
  onClose,
  dayKey,
  intakes,
  totals,
  targets,
  derived,
  remaining,
  profile,
}: {
  onClose: () => void
  dayKey: string
  intakes: HealthIntake[]
  totals: Macros
  targets: DayTargets
  derived: number | null | undefined
  remaining: number | null
  profile: HealthProfile | undefined
}) {
  const { t } = useI18n()
  const [config] = useState(loadAiConfig)
  const configured = isConfigured(config)
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')

  async function send(question: string) {
    const text = question.trim()
    if (text === '' || busy) return
    setError('')
    setBusy(true)
    setDraft('')
    const history = turns
    const context = buildContext({ dayKey, intakes, totals, targets, derived, remaining, profile })
    const result = await chat({
      baseUrl: config.baseUrl.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      temperature: 0.6,
      seed: randomSeed(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: '【数据】\n' + context },
        ...history.map((turn) => ({
          role: turn.role === 'ai' ? ('assistant' as const) : ('user' as const),
          content: turn.text,
        })),
        { role: 'user', content: text },
      ],
    })
    const content = pickReply(result.body)
    if (!result.ok || content === '') {
      setError(explainFailure(result, config.baseUrl))
      setTurns([...history, { role: 'user', text }])
      setBusy(false)
      return
    }
    setTurns([...history, { role: 'user', text }, { role: 'ai', text: content }])
    setBusy(false)
  }

  return (
    <Modal size="sm" label={t('askAi.title')} onClose={onClose}>
      <div className="text-sm font-medium">{t('askAi.title')}</div>

      {!configured ? (
        <>
          <p className="mt-2 text-xs text-muted">{t('askAi.notConfigured')}</p>
          <p className="mt-1 text-xs text-muted">{t('askAi.notConfiguredHint')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.close')}
            </button>
            <Link to="/me/agent/ai" className={SOLID_BUTTON} onClick={onClose}>
              {t('askAi.goConfig')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                disabled={busy}
                onClick={() => void send(preset.text)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand hover:text-fg disabled:opacity-40"
              >
                {t(preset.key)}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {turns.map((turn, index) => (
              <div
                key={index}
                className={
                  turn.role === 'user'
                    ? 'ml-6 rounded-2xl rounded-br-sm bg-surface-2 px-3 py-2 text-sm'
                    : 'mr-6 rounded-2xl rounded-bl-sm border border-line px-3 py-2 text-sm'
                }
              >
                {turn.text}
              </div>
            ))}
            {busy && <div className="text-xs text-muted">{t('askAi.busy')}</div>}
            {error && <div className="text-xs text-danger">{error}</div>}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void send(draft)
              }}
              placeholder={t('askAi.input')}
              className={INPUT + ' flex-1'}
            />
            <button
              type="button"
              onClick={() => void send(draft)}
              disabled={busy || draft.trim() === ''}
              className={SOLID_BUTTON}
            >
              {t('askAi.send')}
            </button>
          </div>

          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.close')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
