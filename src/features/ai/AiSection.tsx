/**
 * 设置页里的「AI 模型」这一段。
 *
 * 这一页的用户是第一次配 AI 的人，所以两件事必须一眼看懂：
 *   1. 现在到底配到哪儿了、能不能用 —— 靠顶上那条状态 + 右上角徽章
 *   2. 万一不通，是哪一步不通、下一步怎么办 —— 靠就地提示 + 自动展开的诊断
 * 填写部分收成一张表单：左边标签、右边控件，不用在一堆格子里找位置。
 * 服务商和模型都是「下拉可选、也能自己填」，模型的候选项从服务商实时拉。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import SettingCard, { SettingBadge } from '../../shared/ui/SettingCard'
import { OUTLINE_BUTTON } from '../../shared/ui/buttonStyles'
import {
  AI_PROVIDERS,
  canTest,
  loadAiConfig,
  loadSavedProviders,
  missingFields,
  rememberProvider,
  saveAiConfig,
} from './aiConfig'
import type { AiConfig } from './aiConfig'
import { listModels, testConnection } from './aiClient'
import type { DiagnoseResult } from './aiClient'
import { INPUT } from '../../shared/ui/inputStyles'

/** 表单的一行：窄屏标签在上，宽屏标签在左 */
function FormRow({
  label,
  children,
  note,
}: {
  label: string
  children: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="grid gap-1.5 border-b border-line px-3 py-3 last:border-b-0 sm:grid-cols-[5.5rem_1fr] sm:items-start sm:gap-3">
      <div className="text-xs text-muted sm:pt-2">{label}</div>
      <div className="min-w-0">
        {children}
        {note}
      </div>
    </div>
  )
}

/** 模型列表的状态：拉取中 / 拉到了 / 没拉到 */
type ModelListState = 'idle' | 'loading' | 'ok' | 'fail'

export default function AiSection() {
  const [config, setConfig] = useState<AiConfig>(loadAiConfig)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<DiagnoseResult | null>(null)
  /** 诊断详情默认收起来，失败时强制展开 */
  const [showSteps, setShowSteps] = useState(false)
  /** 用户自己填过的服务商，跟内置预设一起进下拉 */
  const [savedProviders, setSavedProviders] = useState(loadSavedProviders)
  const [models, setModels] = useState<string[]>([])
  const [modelState, setModelState] = useState<ModelListState>('idle')
  const [modelError, setModelError] = useState('')

  // 边改边存：第一次配的人最容易忘的就是点保存
  useEffect(() => {
    saveAiConfig(config)
  }, [config])

  const provider = AI_PROVIDERS.find((item) => item.id === config.providerId)
  const missing = missingFields(config)
  const filled = missing.length === 0
  /** 测试时卡住的那一步 */
  const failedStep = diagnosis?.steps.find((step) => !step.ok)

  const baseUrl = config.baseUrl.trim()
  const apiKey = config.apiKey.trim()
  /** 没有 key 也允许拉列表的只有本机模型 */
  const canList = baseUrl !== '' && (apiKey !== '' || provider?.keyOptional === true)

  /** 填完地址和 key 就自动拉一次；拉不到也无所谓，模型名可以手填 */
  useEffect(() => {
    if (!canList) return
    let alive = true
    const timer = setTimeout(async () => {
      setModelState('loading')
      setModelError('')
      const result = await listModels(baseUrl, apiKey)
      if (!alive) return
      setModels(result.models)
      setModelState(result.ok ? 'ok' : 'fail')
      setModelError(result.error)
    }, 700)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [baseUrl, apiKey, canList])

  /** 手动刷新：改了 key 或者服务商刚上新时用 */
  async function refreshModels() {
    setModelState('loading')
    setModelError('')
    const result = await listModels(baseUrl, apiKey)
    setModels(result.models)
    setModelState(result.ok ? 'ok' : 'fail')
    setModelError(result.error)
  }

  /** 顶上那条：现在是什么状态，扫一眼就知道 */
  const summary = [
    config.providerName.trim() || provider?.label || '还没选服务商',
    config.model.trim() !== '' ? config.model.trim() : '模型名还没填',
    config.apiKey.trim() !== ''
      ? 'key 已填'
      : provider?.keyOptional
        ? '这家不用 key'
        : 'key 还没填',
  ].join(' · ')

  const verdict = !config.providerName.trim() && !provider
    ? '先挑一家，地址和模型会自动填好；也可以直接写自己的服务商'
    : filled
      ? '三样都齐了，点「测试连接」验证一下'
      : `还差：${missing.join('、')}`

  const badge = diagnosis
    ? { text: diagnosis.ok ? '✓ 通了' : '✗ 没通', tone: diagnosis.ok ? 'ok' : 'bad' }
    : !config.providerName.trim() && !provider
      ? { text: '还没配', tone: 'idle' }
      : filled
        ? { text: '待验证', tone: 'idle' }
        : { text: '还差一步', tone: 'idle' }

  const visionText =
    config.vision === 'yes'
      ? '✓ 支持识别图片'
      : config.vision === 'no'
        ? '✗ 不支持识别图片'
        : '识别图片能力未测'

  const visionClass =
    config.vision === 'yes'
      ? 'text-brand'
      : config.vision === 'no'
        ? 'text-danger'
        : 'text-muted'

  /** 手改字段：改地址或模型后，之前测出来的看图能力就不算数了 */
  function update(patch: Partial<AiConfig>) {
    setDiagnosis(null)
    setShowSteps(false)
    setConfig((current) => {
      const next = { ...current, ...patch }
      if (patch.baseUrl !== undefined || patch.model !== undefined) next.vision = 'unknown'
      return next
    })
  }

  /** 服务商可以直接打名字：命中预设就自动补地址和默认模型，没命中就当自定义 */
  function changeProvider(text: string) {
    const preset = AI_PROVIDERS.find((item) => item.label === text)
    const saved = savedProviders.find((item) => item.name === text)
    setDiagnosis(null)
    setShowSteps(false)
    setConfig((current) => {
      if (preset) {
        return {
          ...current,
          providerId: preset.id,
          providerName: preset.label,
          baseUrl: preset.baseUrl,
          model: preset.model,
          vision: 'unknown',
        }
      }
      // 自己填过的服务商：名字、地址、模型都能直接带回来
      if (saved) {
        return {
          ...current,
          providerId: 'custom',
          providerName: saved.name,
          baseUrl: saved.baseUrl,
          model: saved.model,
          vision: 'unknown',
        }
      }
      return { ...current, providerId: 'custom', providerName: text, vision: 'unknown' }
    })
  }

  async function handleTest() {
    setTesting(true)
    setDiagnosis(null)
    setShowSteps(false)
    // 自己填的服务商，测过一次就记下来，下次下拉里直接能选
    if (config.providerId === 'custom') {
      rememberProvider({
        name: config.providerName,
        baseUrl: config.baseUrl,
        model: config.model,
      })
      setSavedProviders(loadSavedProviders())
    }
    const result = await testConnection(config)
    setTesting(false)
    setDiagnosis(result)
    // 把看图能力记下来：日记页点「图片导入」时要靠它提前把话说清楚
    setConfig((current) => ({ ...current, vision: result.vision }))
  }

  const badgeTone: 'ok' | 'bad' | 'plain' =
    badge.tone === 'ok' ? 'ok' : badge.tone === 'bad' ? 'bad' : 'plain'

  /** 条件不满足时不用 effect 去清空，直接按条件显示，免得同步 setState 触发连锁渲染 */
  const shownModels = canList ? models : []
  const shownState = canList ? modelState : 'idle'
  const shownError = canList ? modelError : ''

  const modelHint =
    shownState === 'loading'
      ? '正在向服务商拉模型列表…'
      : shownState === 'ok'
        ? `已拉到 ${shownModels.length} 个模型，点输入框可以挑`
        : shownState === 'fail'
          ? '没拉到列表，模型名可以手填'
          : canList
            ? '点「刷新列表」或者直接手填'
            : '地址和 key 填好后会自动拉列表'

  return (
    <SettingCard
      title="AI 模型"
      description="让 AI 把随记整理成日记、把拍下来的手写日记转成文字，走的都是这里配的模型。配置只存在你这台机器上，改完自动保存。"
      badge={<SettingBadge tone={badgeTone}>{badge.text}</SettingBadge>}
    >
      {/* 常驻状态条：现在用哪家、模型叫什么、key 填没填 */}
      <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2">
        <div className="font-mono text-xs text-fg">{summary}</div>
        <div className="mt-0.5 text-xs text-muted">{verdict}</div>
      </div>

      {/* 填写：一张表，四行 */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <FormRow
          label="服务商"
          note={
            provider?.note ? <p className="mt-1 text-xs text-muted">{provider.note}</p> : null
          }
        >
          <input
            list="ai-provider-options"
            value={config.providerName}
            spellCheck={false}
            placeholder="选一家，或者直接打名字"
            onChange={(event) => changeProvider(event.target.value)}
            className={INPUT}
          />
          <datalist id="ai-provider-options">
            {AI_PROVIDERS.map((item) => (
              <option key={item.id} value={item.label} />
            ))}
            {savedProviders.map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>
        </FormRow>

        <FormRow
          label="服务地址"
          note={
            <p className="mt-1 text-xs text-muted">填到 /v1 这一层，别把后面的路径也带上。</p>
          }
        >
          <input
            value={config.baseUrl}
            spellCheck={false}
            placeholder="https://api.xiaomimimo.com/v1"
            onChange={(event) => update({ baseUrl: event.target.value })}
            className={INPUT}
          />
        </FormRow>

        <FormRow
          label="模型名"
          note={
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted" title={shownError || undefined}>
                {modelHint}
              </span>
              <button
                type="button"
                disabled={!canList || shownState === 'loading'}
                onClick={() => void refreshModels()}
                className="shrink-0 text-brand transition-opacity disabled:opacity-40"
              >
                刷新列表
              </button>
            </div>
          }
        >
          <input
            list="ai-model-options"
            value={config.model}
            spellCheck={false}
            placeholder="从列表里挑，或者照控制台原样填"
            onChange={(event) => update({ model: event.target.value })}
            className={INPUT}
          />
          <datalist id="ai-model-options">
            {[...new Set([...shownModels, provider?.model ?? ''].filter(Boolean))].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className={`mt-1 text-xs ${visionClass}`}>{visionText}</p>
        </FormRow>

        <FormRow
          label="API Key"
          note={
            provider?.keyUrl ? (
              <p className="mt-1 text-xs text-muted">
                key 去哪儿拿：打开 <span className="text-fg">{provider.keyUrl}</span>
                ，登录后进「API Key / 密钥管理」，新建一个再复制出来。
              </p>
            ) : null
          }
        >
          {/* 显示/隐藏做成输入框里的小按钮，不再另起一个大按钮 */}
          <span className="relative block">
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
        </FormRow>
      </div>

      {/* 测一下：文字通不通 + 能不能看图 */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="text-xs text-fg">点一下，看看通不通、能不能看图</div>

        <div className="mt-2">
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
                  ? `✓ 文字通了 · ${(diagnosis.ms / 1000).toFixed(1)} 秒`
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
