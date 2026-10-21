/**
 * 新增 / 编辑一条模型配置的表单。
 *
 * 五个字段：厂商、服务地址、模型名、API Key（看图能力靠测试得出，不在这里填）。
 * 厂商和模型都是「点开能挑、也能自己填」；模型的候选项从服务商实时拉，
 * 拉不到就把这家「去哪儿查模型名」的网址直接亮出来。
 *
 * 新增时这个表单嵌在「新增模型」按钮下面；编辑时放进弹窗里——同一份组件，两处复用。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AI_PROVIDERS } from './aiConfig'
import { listModels, modelsUrl } from './aiClient'
import { INPUT } from '@/shared/ui/inputStyles'
import ComboBox from '@/shared/ui/ComboBox'
import type { ComboOption } from '@/shared/ui/ComboBox'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'

/** 表单里正在填的内容：没有 id、没有测试结果 */
export interface ModelDraft {
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  apiKey: string
}

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

type ListState = 'idle' | 'loading' | 'ok' | 'fail'

export default function ModelForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ModelDraft
  submitLabel: string
  onSubmit: (draft: ModelDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ModelDraft>(initial)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [listState, setListState] = useState<ListState>('idle')
  const [listError, setListError] = useState('')

  const provider = AI_PROVIDERS.find((item) => item.id === draft.providerId)
  const baseUrl = draft.baseUrl.trim()
  const apiKey = draft.apiKey.trim()
  const canList = baseUrl !== '' && (apiKey !== '' || provider?.keyOptional === true)
  const canSave = baseUrl !== '' && draft.model.trim() !== ''

  // 地址和 key 填好后自动拉一次；拉不到也无所谓，模型名可以手填
  useEffect(() => {
    if (!canList) return
    let alive = true
    const timer = setTimeout(async () => {
      setListState('loading')
      setListError('')
      const result = await listModels(baseUrl, apiKey)
      if (!alive) return
      setModels(result.models)
      setListState(result.ok ? 'ok' : 'fail')
      setListError(result.error)
    }, 700)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [baseUrl, apiKey, canList])

  async function refreshModels() {
    if (!canList) return
    setListState('loading')
    setListError('')
    const result = await listModels(baseUrl, apiKey)
    setModels(result.models)
    setListState(result.ok ? 'ok' : 'fail')
    setListError(result.error)
  }

  function update(patch: Partial<ModelDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  /** 服务商可以直接打名字：命中预设就自动补地址和默认模型，没命中就当自定义 */
  function changeProvider(text: string) {
    const preset = AI_PROVIDERS.find((item) => item.label === text)
    if (preset) {
      setDraft((current) => ({
        ...current,
        providerId: preset.id,
        providerName: preset.label,
        baseUrl: preset.baseUrl,
        model: preset.model,
      }))
      return
    }
    setDraft((current) => ({ ...current, providerId: 'custom', providerName: text }))
  }

  const providerOptions: ComboOption[] = AI_PROVIDERS.filter(
    (item) => item.id !== 'custom',
  ).map((item) => ({ value: item.label, hint: '内置' }))

  const modelOptions: ComboOption[] = [
    ...new Set([...models, provider?.model ?? ''].filter(Boolean)),
  ].map((name) => ({ value: name }))

  const shownState = canList ? listState : 'idle'
  const shownError = canList ? listError : ''
  const lookupUrl = provider?.modelListUrl ?? (baseUrl !== '' ? modelsUrl(baseUrl) : '')
  const lookupLabel = provider?.modelListUrl ? `去 ${provider.label} 看模型名` : '打开模型列表地址'

  const modelHint =
    shownState === 'loading'
      ? '正在向服务商拉模型列表…'
      : shownState === 'ok'
        ? `已拉到 ${models.length} 个模型，点开可以直接挑`
        : shownState === 'fail'
          ? '没拉到列表，可以手填，或者照下面给的网址去查'
          : canList
            ? '点「刷新列表」或者直接手填'
            : '地址和 key 填好后会自动拉列表'

  return (
    <div>
      <div className="rounded-xl border border-line">
        <FormRow
          label="服务商"
          note={provider?.note ? <p className="mt-1 text-xs text-muted">{provider.note}</p> : null}
        >
          <ComboBox
            value={draft.providerName}
            options={providerOptions}
            onChange={changeProvider}
            onSelect={(option) => changeProvider(option.value)}
            placeholder="点开挑一家，或者直接打名字"
            inputClassName={INPUT}
            ariaLabel="服务商"
            emptyHint="没有匹配的服务商，直接输入名字就行"
          />
        </FormRow>

        <FormRow
          label="服务地址"
          note={<p className="mt-1 text-xs text-muted">填到 /v1 这一层，别把后面的路径也带上。</p>}
        >
          <input
            value={draft.baseUrl}
            spellCheck={false}
            placeholder="https://api.deepseek.com/v1"
            onChange={(event) => update({ baseUrl: event.target.value })}
            className={INPUT}
          />
        </FormRow>

        <FormRow
          label="模型名"
          note={
            <div className="mt-1 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`min-w-0 flex-1 ${shownState === 'fail' ? 'text-danger' : 'text-muted'}`}
                  title={shownError || undefined}
                >
                  {shownState === 'fail' && shownError ? `没拉到列表：${shownError}` : modelHint}
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
              {shownState === 'fail' && lookupUrl !== '' && (
                <a
                  href={lookupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-brand underline decoration-dotted underline-offset-2"
                >
                  {lookupLabel} →
                </a>
              )}
            </div>
          }
        >
          <ComboBox
            value={draft.model}
            options={modelOptions}
            onChange={(text) => update({ model: text })}
            onSelect={(option) => update({ model: option.value })}
            placeholder="点开挑一个，或者照控制台原样填"
            inputClassName={INPUT}
            ariaLabel="模型名"
            emptyHint={shownState === 'fail' ? '列表没拉到时，直接手填模型名' : '没有匹配的模型'}
          />
        </FormRow>

        <FormRow
          label="API Key"
          note={
            provider?.keyUrl ? (
              <p className="mt-1 text-xs text-muted">
                key 去哪儿拿：打开{' '}
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline decoration-dotted underline-offset-2"
                >
                  {provider.keyUrl}
                </a>
                ，登录后进「API Key / 密钥管理」，新建一个再复制出来。
              </p>
            ) : null
          }
        >
          <span className="relative block">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
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
          {draft.apiKey.trim() === '' && provider?.keyOptional !== true && (
            <p className="mt-1 text-xs text-muted">先存着也行，但没 key 暂时用不了，列表里会标出来。</p>
          )}
        </FormRow>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSubmit({
              ...draft,
              providerName:
                draft.providerName.trim() || provider?.label || '自定义',
              baseUrl: draft.baseUrl.trim(),
              model: draft.model.trim(),
              apiKey: draft.apiKey.trim(),
            })
          }
          className={`${SOLID_BUTTON} disabled:opacity-40`}
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>
          取消
        </button>
        {!canSave && <span className="text-xs text-muted">地址和模型名填上就能保存</span>}
      </div>
    </div>
  )
}
