/**
 * 设置页里的「AI 模型」：一个列表 + 每条模型的联通状态。
 *
 * 这里管理的是「可以启用哪些模型」——每条都是完整配置（厂商、地址、模型名、key），
 * 同一时间只启用其中一条，AI 整理、图片导入用的都是它。
 *
 * 页面上三件事要一眼看懂：
 *   1. 现在启用的是哪条、能不能用 —— 顶部摘要 + 卡片徽章 + 条目上的「启用中」
 *   2. 每条通不通、快不快、能不能看图 —— 条目上的状态，测试结果会存下来并标时间
 *   3. 拉不到模型列表时去哪儿查 —— 表单里直接给出厂商的模型列表网址
 */
import { useEffect, useState } from 'react'
import SettingCard, { SettingBadge } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import BatchActions from '@/shared/ui/BatchActions'
import Modal from '@/shared/ui/Modal'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { MessageParams } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import {
  BAR_BUTTON,
  BAR_DANGER,
  OUTLINE_BUTTON,
  SOLID_BUTTON,
  SOLID_DANGER,
} from '@/shared/ui/buttonStyles'
import {
  canTest,
  isConfigured,
  loadActiveId,
  loadModels,
  missingFields,
  newModelId,
  presetNameKey,
  saveActiveId,
  saveModels,
} from './aiConfig'
import type { AiModel } from './aiConfig'
import { testConnection } from './aiClient'
import type { DiagnoseResult } from './aiClient'
import ModelForm from './ModelForm'
import type { ModelDraft } from './ModelForm'

/** 条目底部的小文字按钮 */
const SLIP_BUTTON = 'rounded-lg px-2 py-1 text-xs transition-colors'

type Translate = (key: MessageKey, params?: MessageParams) => string

/** key 只露头尾：列表里能看出「填了哪一把」，但不会把整把 key 甩在屏幕上 */
function keyMask(key: string, t: Translate) {
  const trimmed = key.trim()
  if (trimmed === '') return t('ai.noKey')
  if (trimmed.length <= 8) return t('ai.keyFilled')
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/** 「今天 14:23」/「10月20日 14:23」 */
function formatTestAt(ms: number, t: Translate) {
  const date = new Date(ms)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const time = `${hour}:${minute}`
  return sameDay
    ? t('ai.todayAt', { time })
    : t('ai.dateAt', { month: date.getMonth() + 1, day: date.getDate(), time })
}

/** 把一次诊断的结果落到条目上：看图能力 + 联通状态 + 时间 */
function withResult(model: AiModel, result: DiagnoseResult, at: number, t: Translate): AiModel {
  const failed = result.steps.find((step) => !step.ok)
  return {
    ...model,
    vision: result.vision,
    lastTest: {
      ok: result.ok,
      ms: result.ms,
      at,
      vision: result.vision,
      error: result.ok ? '' : (failed?.title ?? t('ai.notPassed')),
    },
  }
}

export default function AiSection() {
  const { showToast } = useToast()
  const { t } = useI18n()
  const [models, setModels] = useState<AiModel[]>(loadModels)
  const [activeId, setActiveId] = useState(() => loadActiveId(models))
  /** 新增表单展开在按钮下面；编辑走弹窗 */
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AiModel | null>(null)
  /** 待确认删除：active 表示里面有正在启用的那条 */
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; active: boolean } | null>(
    null,
  )
  const [testingId, setTestingId] = useState('')
  const [testingAll, setTestingAll] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const batch = useBatchSelect()

  // 列表和「启用谁」都边改边存：这一页最容易出现的失误就是改完忘了保存
  useEffect(() => {
    saveModels(models)
  }, [models])
  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  const active = models.find((item) => item.id === activeId)
  const missing = active ? missingFields(active) : []
  const ready = active ? isConfigured(active) : false

  /** 预设厂商按 providerId 取文案；用户自己敲的名字按原样显示 */
  function displayProviderName(model: AiModel) {
    const key = presetNameKey(model.providerId)
    return key ? t(key) : model.providerName || t('ai.preset.custom')
  }

  const summary = active
    ? `${displayProviderName(active)} · ${active.model}`
    : models.length === 0
      ? t('ai.noModels')
      : t('ai.noneActive')
  const verdict = !active
    ? models.length === 0
      ? t('ai.emptyHint')
      : t('ai.pickOne')
    : missing.length > 0
      ? t('ai.missingFields', {
          fields: missing.map((key) => t(key)).join(t('common.listSeparator')),
        })
      : t('ai.readyHint')

  const badge = !active
    ? { text: models.length === 0 ? t('ai.notConfigured') : t('ai.notEnabled'), tone: 'plain' as const }
    : !ready
      ? { text: t('ai.oneStepMissing'), tone: 'plain' as const }
      : active.lastTest
        ? active.lastTest.ok
          ? { text: t('ai.passed'), tone: 'ok' as const }
          : { text: t('ai.failed'), tone: 'bad' as const }
        : { text: t('ai.pendingTest'), tone: 'plain' as const }

  const selectableIds = models.map((item) => item.id)

  function handleAdd(draft: ModelDraft) {
    const model: AiModel = {
      ...draft,
      id: newModelId(),
      vision: 'unknown',
    }
    // 新加的放最前面，一眼能看到；列表原本是空的就顺手启用它
    setModels((current) => [model, ...current])
    if (activeId === '') setActiveId(model.id)
    setFormOpen(false)
    showToast({ message: t('ai.added', { model: model.model }) })
  }

  function handleEdit(draft: ModelDraft) {
    const target = editing
    if (!target) return
    setEditing(null)
    setModels((current) =>
      current.map((item) => {
        if (item.id !== target.id) return item
        const changed = item.baseUrl !== draft.baseUrl || item.model !== draft.model
        return {
          ...item,
          ...draft,
          // 地址或模型名变了，之前测出来的看图能力和联通状态就不算数了
          vision: changed ? 'unknown' : item.vision,
          lastTest: changed ? undefined : item.lastTest,
        }
      }),
    )
    showToast({ message: t('ai.saved') })
  }

  function handleActivate(id: string) {
    setActiveId(id)
    batch.exit()
    const model = models.find((item) => item.id === id)
    showToast({ message: t('ai.activated', { model: model?.model ?? t('ai.fallbackModel') }) })
  }

  /** 停用：一条都不启用，AI 相关入口随之关掉；模型配置本身保留，随时能再启用 */
  function handleDeactivate() {
    setActiveId('')
    batch.exit()
    showToast({ message: t('ai.disabledToast') })
  }

  /** 单条测试：结果直接落在条目上 */
  async function handleTestOne(model: AiModel) {
    setTestingId(model.id)
    const result = await testConnection(model)
    const at = Date.now()
    setModels((current) =>
      current.map((item) => (item.id === model.id ? withResult(model, result, at, t) : item)),
    )
    setTestingId('')
  }

  /** 一键测全部：一条条来，页面上能看到进度，也不会同时把服务商打懵 */
  async function handleTestAll() {
    if (models.length === 0) return
    setTestingAll(true)
    setProgress({ done: 0, total: models.length })
    let ok = 0
    for (const [index, model] of models.entries()) {
      setTestingId(model.id)
      const result = await testConnection(model)
      if (result.ok) ok += 1
      const at = Date.now()
      setModels((current) =>
        current.map((item) => (item.id === model.id ? withResult(model, result, at, t) : item)),
      )
      setProgress({ done: index + 1, total: models.length })
    }
    setTestingId('')
    setTestingAll(false)
    showToast({ message: t('ai.testAllDone', { ok, bad: models.length - ok }) })
  }

  function requestDelete(ids: string[]) {
    if (ids.length === 0) return
    setPendingDelete({ ids, active: ids.includes(activeId) })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const { ids, active: removesActive } = pendingDelete
    setPendingDelete(null)
    setModels((current) => current.filter((item) => !ids.includes(item.id)))
    batch.clear()
    if (removesActive) {
      // 不自动换一条：用户明确知道自己在删启用中的那条，就先留空
      setActiveId('')
      showToast({ message: t('ai.deletedActive') })
    } else {
      showToast({ message: t('ai.deletedCount', { count: ids.length }) })
    }
  }

  const busy = testingAll || testingId !== ''

  return (
    <PageShell
      backTo="/me/agent"
      backLabel={t('me.agent')}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setFormOpen(true)
              setEditing(null)
            }}
            className={SOLID_BUTTON}
          >
            {t('ai.addModel')}
          </button>
          <button
            type="button"
            disabled={models.length === 0 || busy}
            onClick={() => void handleTestAll()}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {testingAll
              ? t('ai.testingProgress', { done: progress.done, total: progress.total })
              : t('ai.testAll')}
          </button>
          {models.length > 0 && !batch.active && (
            <button type="button" onClick={batch.enter} className={SOLID_BUTTON}>
              {t('ai.batchManage')}
            </button>
          )}
        </>
      }
    >
      <SettingCard
        title={t('ai.title')}
        description={t('ai.description')}
        badge={<SettingBadge tone={badge.tone}>{badge.text}</SettingBadge>}
      >
        {/* 常驻状态条：现在用哪条、缺什么、下一步做什么 */}
        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="font-mono text-xs break-all text-fg">{summary}</div>
          <div className="mt-0.5 text-xs text-muted">{verdict}</div>
        </div>

      {models.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
          {t('ai.emptyList')}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {models.map((model) => {
            const isActive = model.id === activeId
            const selected = batch.isSelected(model.id)
            const test = model.lastTest
            const configOk = isConfigured(model)
            return (
              <li
                key={model.id}
                className={`rounded-xl border ${
                  selected
                    ? 'border-brand bg-surface-2'
                    : isActive
                      ? 'border-brand'
                      : 'border-line'
                }`}
              >
                <div className="flex items-start gap-2 p-3">
                  {batch.active ? (
                    <button
                      type="button"
                      aria-label={selected ? t('ai.deselect') : t('ai.select')}
                      onClick={() => batch.toggle(model.id)}
                      className={
                        selected
                          ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-on-brand'
                          : 'mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line'
                      }
                    >
                      {selected ? '✓' : ''}
                    </button>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        isActive ? 'bg-brand' : 'bg-line'
                      }`}
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium break-all text-fg">{model.model}</span>
                      <span className="text-xs text-muted">{displayProviderName(model)}</span>
                      {isActive && <SettingBadge tone="ok">{t('ai.active')}</SettingBadge>}
                      {!configOk && <SettingBadge tone="bad">{t('ai.needKey')}</SettingBadge>}
                    </div>
                    <p className="mt-1 font-mono text-xs break-all text-muted">
                      {model.baseUrl} · {keyMask(model.apiKey, t)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span
                        className={
                          model.vision === 'yes'
                            ? 'text-brand'
                            : model.vision === 'no'
                              ? 'text-danger'
                              : 'text-muted'
                        }
                      >
                        {model.vision === 'yes'
                          ? t('ai.visionYes')
                          : model.vision === 'no'
                            ? t('ai.visionNo')
                            : t('ai.visionUnknown')}
                      </span>
                      <span
                        className={
                          test
                            ? test.ok
                              ? 'text-brand'
                              : 'text-danger'
                            : 'text-muted'
                        }
                        title={test?.error || undefined}
                      >
                        {test
                          ? test.ok
                            ? t('ai.testOk', { ms: test.ms, at: formatTestAt(test.at, t) })
                            : t('ai.testBad', { at: formatTestAt(test.at, t) })
                          : t('ai.untested')}
                      </span>
                    </div>
                  </div>
                </div>

                {!batch.active && (
                  <div className="flex flex-wrap items-center justify-end gap-1 border-t border-line px-3 py-1.5">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => handleActivate(model.id)}
                        className={`${SLIP_BUTTON} text-brand hover:opacity-80`}
                      >
                        {t('ai.enable')}
                      </button>
                    )}
                    {isActive && (
                      <button
                        type="button"
                        onClick={handleDeactivate}
                        className={`${SLIP_BUTTON} text-muted hover:text-fg`}
                      >
                        {t('ai.disable')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canTest(model) || busy}
                      onClick={() => void handleTestOne(model)}
                      className={`${SLIP_BUTTON} text-muted hover:text-fg disabled:opacity-40`}
                    >
                      {testingId === model.id ? t('ai.testing') : t('ai.test')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(model)
                        setFormOpen(false)
                      }}
                      className={`${SLIP_BUTTON} text-muted hover:text-fg`}
                    >
                      {t('ai.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete([model.id])}
                      className={`${SLIP_BUTTON} text-danger hover:opacity-80`}
                    >
                      {t('ai.delete')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {batch.active && (
        <BatchActions select={batch} ids={selectableIds} unit={t('ai.unit')}>
          <button
            type="button"
            disabled={batch.count !== 1}
            onClick={() => batch.selected[0] && handleActivate(batch.selected[0])}
            className={BAR_BUTTON}
          >
            {t('ai.setActive')}
          </button>
          <button
            type="button"
            disabled={batch.count === 0}
            onClick={() => requestDelete(batch.selected)}
            className={BAR_DANGER}
          >
            {t('ai.delete')}
          </button>
        </BatchActions>
      )}

      {/* 新增和编辑一样走弹窗：列表不被顶开，手机上也不用长滚 */}
      {formOpen && (
        <Modal
          size="lg"
          label={t('ai.formTitle')}
          onClose={() => setFormOpen(false)}
          panelClassName="max-h-[80vh] overflow-y-auto"
        >
          <div className="mb-3 text-xs text-fg">{t('ai.formTitle')}</div>
          <ModelForm
            initial={{ providerId: '', providerName: '', baseUrl: '', model: '', apiKey: '' }}
            submitLabel={t('ai.formSubmit')}
            onSubmit={handleAdd}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}

      {/* 编辑走弹窗：列表保持不动，改完关掉就能看到新状态 */}
      {editing && (
        <Modal
          size="lg"
          label={t('ai.editTitle')}
          onClose={() => setEditing(null)}
          panelClassName="max-h-[80vh] overflow-y-auto"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-fg">{t('ai.editTitle')}</h3>
            <span className="font-mono text-xs text-muted">{displayProviderName(editing)}</span>
          </div>
          <ModelForm
            initial={{
              providerId: editing.providerId,
              providerName: displayProviderName(editing),
              baseUrl: editing.baseUrl,
              model: editing.model,
              apiKey: editing.apiKey,
            }}
            submitLabel={t('ai.editSubmit')}
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {/* 删的是正在启用的那条：先把风险说清楚，再给硬删的出口 */}
      {pendingDelete && pendingDelete.active && (
        <Modal size="sm" label={t('ai.deleteActiveTitle')} onClose={() => setPendingDelete(null)}>
          <h3 className="text-sm font-medium text-fg">{t('ai.deleteActiveTitle')}</h3>
          <p className="mt-2 text-xs text-muted">{t('ai.deleteActiveBody')}</p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setPendingDelete(null)} className={OUTLINE_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingDelete(null)
                batch.exit()
                showToast({ message: t('ai.switchElseHint') })
              }}
              className={SOLID_BUTTON}
            >
              {t('ai.switchElse')}
            </button>
            <button type="button" onClick={confirmDelete} className={SOLID_DANGER}>
              {t('ai.deleteAnyway')}
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && !pendingDelete.active && (
        <ConfirmDialog
          title={t('ai.confirmDeleteTitle', { count: pendingDelete.ids.length })}
          description={t('ai.confirmDeleteBody')}
          confirmLabel={t('ai.delete')}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </SettingCard>
    </PageShell>
  )
}
