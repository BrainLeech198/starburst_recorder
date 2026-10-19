/**
 * 设置页里的「AI 模型」这一段。
 *
 * 这一页的用户是第一次配 AI 的人，所以两件事必须一眼看懂：
 *   1. 现在到底配到哪儿了、能不能用 —— 靠顶上那条状态 + 右上角徽章
 *   2. 万一不通，是哪一步不通、下一步怎么办 —— 靠就地提示 + 自动展开的诊断
 * 整体收进一张卡片，步骤带圆标，免得看起来像一堆散装的行。
 */
import { useEffect, useState } from 'react'
import SettingCard, { SettingBadge } from '../../shared/ui/SettingCard'
import { choiceTile, OUTLINE_BUTTON } from '../../shared/ui/buttonStyles'
import {
  AI_PROVIDERS,
  canTest,
  loadAiConfig,
  missingFields,
  saveAiConfig,
} from './aiConfig'
import type { AiConfig, AiProvider } from './aiConfig'
import { testConnection } from './aiClient'
import type { DiagnoseResult } from './aiClient'

const INPUT =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-brand'
const LABELED_INPUT = `mt-1 ${INPUT}`

/** 步骤前的小圆标：这一小步做完了就变成主题色的 ✓，没做完显示序号 */
function StepMark({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs',
        done ? 'bg-brand text-on-brand' : 'border border-line text-muted',
      ].join(' ')}
    >
      {done ? '✓' : index}
    </span>
  )
}

/** 厂商卡片：左边一个首字母圆标，扫一眼能认出是哪家 */
function ProviderTile({
  provider,
  active,
  onPick,
}: {
  provider: AiProvider
  active: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={choiceTile(active, 'flex flex-col items-center gap-1 px-1.5 py-2')}
    >
      <span
        aria-hidden="true"
        className={[
          'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs',
          active ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted',
        ].join(' ')}
      >
        {provider.label.slice(0, 1)}
      </span>
      <span className="w-full truncate text-center">{provider.label}</span>
    </button>
  )
}

export default function AiSection() {
  const [config, setConfig] = useState<AiConfig>(loadAiConfig)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<DiagnoseResult | null>(null)
  /** 诊断详情默认收起来，失败时强制展开 */
  const [showSteps, setShowSteps] = useState(false)

  // 边改边存：第一次配的人最容易忘的就是点保存
  useEffect(() => {
    saveAiConfig(config)
  }, [config])

  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const missing = missingFields(config)
  const filled = missing.length === 0
  /** 测试时卡住的那一步 */
  const failedStep = diagnosis?.steps.find((step) => !step.ok)

  /** 顶上那条：现在是什么状态，扫一眼就知道 */
  const summary = [
    provider ? provider.label : '还没选服务商',
    config.model.trim() !== '' ? config.model.trim() : '模型名还没填',
    config.apiKey.trim() !== ''
      ? 'key 已填'
      : provider?.keyOptional
        ? '这家不用 key'
        : 'key 还没填',
  ].join(' · ')

  const verdict = !provider
    ? '先挑一家，地址和模型会自动填好'
    : filled
      ? '三样都齐了，点「测试连接」验证一下'
      : `还差：${missing.join('、')}`

  const badge = diagnosis
    ? { text: diagnosis.ok ? '✓ 通了' : '✗ 没通', tone: diagnosis.ok ? 'ok' : 'bad' }
    : !provider
      ? { text: '还没配', tone: 'idle' }
      : filled
        ? { text: '待验证', tone: 'idle' }
        : { text: '还差一步', tone: 'idle' }

  function update(patch: Partial<AiConfig>) {
    setConfig((current) => ({ ...current, ...patch }))
    setDiagnosis(null)
    setShowSteps(false)
  }

  function pickProvider(item: AiProvider) {
    update({ providerId: item.id, baseUrl: item.baseUrl, model: item.model })
  }

  async function handleTest() {
    setTesting(true)
    setDiagnosis(null)
    setShowSteps(false)
    const result = await testConnection(config)
    setTesting(false)
    setDiagnosis(result)
  }

  const badgeTone: 'ok' | 'bad' | 'plain' =
    badge.tone === 'ok' ? 'ok' : badge.tone === 'bad' ? 'bad' : 'plain'

  return (
    <SettingCard
      title="AI 模型"
      description="让 AI 帮你把随记整理成日记，走的就是这里配的模型。配置只存在你这台机器上，改完自动保存。"
      badge={<SettingBadge tone={badgeTone}>{badge.text}</SettingBadge>}
    >
      {/* 常驻状态条：现在用哪家、模型叫什么、key 填没填 */}
      <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2">
        <div className="font-mono text-xs text-fg">{summary}</div>
        <div className="mt-0.5 text-xs text-muted">{verdict}</div>
      </div>

      {/* ① 选一家 */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <StepMark index={1} done={provider !== undefined} />
          <span className="text-xs text-fg">你用哪家？点一下，地址和模型自己填好</span>
        </div>
        {/* 宽屏一片 4 列的格子墙，窄屏自动收回 2 列 */}
        <div className="mt-2 ml-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AI_PROVIDERS.map((item) => (
            <ProviderTile
              key={item.id}
              provider={item}
              active={config.providerId === item.id}
              onPick={() => pickProvider(item)}
            />
          ))}
        </div>
        {provider?.note && <p className="mt-2 ml-7 text-xs text-muted">{provider.note}</p>}
      </div>

      {/* ② 填参数 */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <StepMark index={2} done={filled} />
          <span className="text-xs text-fg">填三样东西</span>
        </div>

        <div className="mt-2 ml-7">
          <label className="block text-xs text-muted">
            服务地址
            <span className="ml-1">（填到 /v1 这一层，别带后面的路径）</span>
            <input
              value={config.baseUrl}
              spellCheck={false}
              placeholder="https://api.xiaomimimo.com/v1"
              onChange={(event) => update({ baseUrl: event.target.value })}
              className={LABELED_INPUT}
            />
          </label>

          <label className="mt-3 block text-xs text-muted">
            模型名
            <span className="ml-1">（跟控制台里一模一样，一个字符都别差）</span>
            <input
              value={config.model}
              spellCheck={false}
              placeholder="mimo-v2.5-pro"
              onChange={(event) => update({ model: event.target.value })}
              className={LABELED_INPUT}
            />
          </label>

          <label className="mt-3 block text-xs text-muted">
            API Key
            <span className="ml-1">（服务商给你的那串密码）</span>
            {/* 显示/隐藏做成输入框里的小按钮，不再另起一个大按钮 */}
            <span className="relative mt-1 block">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                spellCheck={false}
                autoComplete="off"
                placeholder={provider?.keyOptional ? '这家不用填' : '粘贴到这里'}
                onChange={(event) => update({ apiKey: event.target.value })}
                className={`${INPUT} pr-14`}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-fg"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </span>
          </label>

          {provider?.keyUrl && (
            <p className="mt-2 text-xs text-muted">
              key 去哪儿拿：打开 <span className="text-fg">{provider.keyUrl}</span>，登录后进「API
              Key / 密钥管理」，新建一个再复制出来。
            </p>
          )}
        </div>
      </div>

      {/* ③ 测一下 */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <StepMark index={3} done={diagnosis?.ok === true} />
          <span className="text-xs text-fg">点一下，看看通不通</span>
        </div>

        <div className="mt-2 ml-7">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testing || !canTest(config)}
              onClick={() => void handleTest()}
              className={OUTLINE_BUTTON}
            >
              {testing ? '正在连接…' : '测试连接'}
            </button>

            {/* 结果就在按钮旁边，不用往下找 */}
            {diagnosis && (
              <span className={diagnosis.ok ? 'text-xs text-brand' : 'text-xs text-danger'}>
                {diagnosis.ok
                  ? `✓ 通了 · ${(diagnosis.ms / 1000).toFixed(1)} 秒`
                  : `✗ ${failedStep?.title ?? '没通'}`}
              </span>
            )}

            {!diagnosis && !canTest(config) && (
              <span className="text-xs text-muted">先把地址和模型名填上</span>
            )}
          </div>

          {diagnosis && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowSteps((value) => !value)}
                className="text-xs text-muted transition-colors hover:text-fg"
              >
                {showSteps ? '收起诊断详情' : `看诊断详情（${diagnosis.steps.length} 步）`}
              </button>

              {/* 失败时自动展开：不看原因就没法修 */}
              {(showSteps || !diagnosis.ok) && (
                <ul className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2">
                  {diagnosis.steps.map((step) => (
                    <li key={step.title} className="flex gap-2 text-xs">
                      <span className={step.ok ? 'text-brand' : 'text-danger'}>
                        {step.ok ? '✓' : '✗'}
                      </span>
                      <span className="text-muted">
                        <span className="text-fg">{step.title}</span> · {step.detail}
                      </span>
                    </li>
                  ))}
                  {diagnosis.ok && diagnosis.reply && (
                    <li className="mt-1 border-t border-line pt-2 text-xs text-fg">
                      模型回话：{diagnosis.reply}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingCard>
  )
}
