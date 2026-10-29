/**
 * 「记一笔」里对**还没记入**的这一份食物问 AI。
 *
 * 跟首页那个只问当天汇总的入口不同：这里带着选好的食物、克数和折算后的营养，
 * 再叠上当天已记的摄入与目标线，所以 AI 能直接回答「这一份吃下去合适吗」。
 * 一旦点「确定本项」进了摄入列表，就不再提供提问入口。
 *
 * 做成内嵌面板而不是再开弹窗：IntakeDialog 本身就是弹窗，叠两层焦点陷阱会打架。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import type { HealthIntake, HealthProfile } from '@/core/db/schema'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import { isConfigured, loadAiConfig } from '@/features/ai/aiConfig'
import { useI18n } from '@/shared/i18n/context'
import { INPUT } from '@/shared/ui/inputStyles'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import type { DayTargets, Macros } from './healthMath'
import { formatNum } from './healthMath'

interface Turn {
  role: 'user' | 'ai'
  text: string
}

const SYSTEM_PROMPT = [
  '你是「星芒记录者」的健康助手，正在帮用户判断**还没记入**的一份食物。',
  '说话直接、给数字、给能执行的建议：不要空话，不要说教。',
  '重点判断这一份的热量、蛋白和份量是否合适，需要时再对照当天已吃的量和剩余额度。',
  '回答尽量简短（200 字以内），用用户提问的语言。',
].join('\n')

function line(value: number | null | undefined) {
  return value === null || value === undefined ? '暂无' : formatNum(value)
}

/** 当天已有摄入 + 这一份，拼成一段中文摘要 */
function buildContext(input: {
  dayKey: string
  intakes: HealthIntake[]
  totals: Macros
  targets: DayTargets
  derived: number | null | undefined
  profile: HealthProfile | undefined
  candidate: { name: string; grams: number } & Macros
}) {
  const parts: string[] = []
  parts.push('日期：' + input.dayKey)
  parts.push('今天已经记下的摄入（时间 名字 克数 千卡 蛋白g）：')
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
    '今天已记合计：' +
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
    '这一份还没记：' +
      input.candidate.name +
      ' ' +
      input.candidate.grams +
      'g，' +
      formatNum(input.candidate.kcal) +
      '千卡，蛋白' +
      formatNum(input.candidate.protein) +
      'g，碳水' +
      formatNum(input.candidate.carbs) +
      'g，脂肪' +
      input.candidate.fat +
      'g',
  )
  parts.push(
    '加上这一份后合计：' +
      formatNum(input.totals.kcal + input.candidate.kcal) +
      '千卡，蛋白' +
      formatNum(input.totals.protein + input.candidate.protein) +
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
  parts.push(
    '距离目标还剩：' +
      line(
        input.targets.targetKcal === null
          ? null
          : input.targets.targetKcal - input.totals.kcal - input.candidate.kcal,
      ) +
      ' 千卡（负数是超了）',
  )
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

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export default function IntakeAiReview({
  onClose,
  dayKey,
  intakes,
  totals,
  targets,
  derived,
  profile,
  candidate,
}: {
  onClose: () => void
  dayKey: string
  intakes: HealthIntake[]
  totals: Macros
  targets: DayTargets
  derived: number | null | undefined
  profile: HealthProfile | undefined
  /** 正在配份量的这一份：名字、克数与折算后的营养 */
  candidate: { name: string; grams: number } & Macros
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
    const result = await chat({
      baseUrl: config.baseUrl.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      temperature: 0.6,
      seed: randomSeed(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: '【数据】\n' + buildContext({ dayKey, intakes, totals, targets, derived, profile, candidate }),
        },
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

  /** 点开就替用户问第一句，省得再打字 */
  function firstQuestion() {
    return t('askAi.presetFit') + '：' + candidate.name + ' ' + candidate.grams + 'g'
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-sm text-fg">{t('askAi.title')}</p>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {candidate.name} · {candidate.grams} g · {formatNum(candidate.kcal)}{' '}
            {t('health.kcalUnit')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
        >
          {t('common.close')}
        </button>
      </div>

      {!configured ? (
        <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
          <p className="m-0">{t('askAi.notConfigured')}</p>
          <p className="m-0 mt-1">{t('askAi.notConfiguredHint')}</p>
          <Link to="/me/agent/ai" className="mt-2 inline-block text-brand underline">
            {t('askAi.goConfig')}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
            {turns.length === 0 && !busy && (
              <button
                type="button"
                onClick={() => void send(firstQuestion())}
                className="self-start rounded-2xl rounded-tl-sm border border-brand/40 bg-surface px-3 py-2 text-left text-sm text-brand transition-colors hover:bg-surface-2"
              >
                {firstQuestion()}
              </button>
            )}
            {turns.map((turn, index) => (
              <div
                key={index}
                className={
                  turn.role === 'user'
                    ? 'ml-6 rounded-2xl rounded-br-sm bg-surface-2 px-3 py-2 text-sm'
                    : 'mr-6 rounded-2xl rounded-bl-sm border border-line bg-surface px-3 py-2 text-sm'
                }
              >
                {turn.text}
              </div>
            ))}
            {busy && <div className="text-xs text-muted">{t('askAi.busy')}</div>}
            {error && <div className="text-xs text-danger">{error}</div>}
          </div>

          <div className="flex items-center gap-2">
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

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.close')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
