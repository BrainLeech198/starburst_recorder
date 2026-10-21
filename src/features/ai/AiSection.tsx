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
import SettingCard, { SettingBadge } from '../../shared/ui/SettingCard'
import PageShell from '../../shared/ui/PageShell'
import BatchActions from '../../shared/ui/BatchActions'
import Modal from '../../shared/ui/Modal'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useBatchSelect } from '../../shared/ui/useBatchSelect'
import { useToast } from '../../app/providers/ToastProvider'
import {
  BAR_BUTTON,
  BAR_DANGER,
  OUTLINE_BUTTON,
  SOLID_BUTTON,
  SOLID_DANGER,
} from '../../shared/ui/buttonStyles'
import {
  canTest,
  isConfigured,
  loadActiveId,
  loadModels,
  missingFields,
  newModelId,
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

/** key 只露头尾：列表里能看出「填了哪一把」，但不会把整把 key 甩在屏幕上 */
function keyMask(key: string) {
  const trimmed = key.trim()
  if (trimmed === '') return '没有 key'
  if (trimmed.length <= 8) return 'key 已填'
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/** 「今天 14:23」/「10月20日 14:23」 */
function formatTestAt(ms: number) {
  const date = new Date(ms)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return sameDay
    ? `今天 ${hour}:${minute}`
    : `${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute}`
}

/** 把一次诊断的结果落到条目上：看图能力 + 联通状态 + 时间 */
function withResult(model: AiModel, result: DiagnoseResult, at: number): AiModel {
  const failed = result.steps.find((step) => !step.ok)
  return {
    ...model,
    vision: result.vision,
    lastTest: {
      ok: result.ok,
      ms: result.ms,
      at,
      vision: result.vision,
      error: result.ok ? '' : (failed?.title ?? '没通'),
    },
  }
}

export default function AiSection() {
  const { showToast } = useToast()
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

  const summary = active
    ? `${active.providerName} · ${active.model}`
    : models.length === 0
      ? '还没有模型'
      : '当前没有启用任何模型'
  const verdict = !active
    ? models.length === 0
      ? '点「新增模型」填一条，填完会自动启用'
      : 'AI 助手暂时用不了：在列表里点「启用」挑一条'
    : missing.length > 0
      ? `还差：${missing.join('、')}`
      : '可以用了：AI 整理和图片导入都会走这条模型'

  const badge = !active
    ? { text: models.length === 0 ? '还没配' : '未启用', tone: 'plain' as const }
    : !ready
      ? { text: '还差一步', tone: 'plain' as const }
      : active.lastTest
        ? active.lastTest.ok
          ? { text: '✓ 通了', tone: 'ok' as const }
          : { text: '✗ 没通', tone: 'bad' as const }
        : { text: '待验证', tone: 'plain' as const }

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
    showToast({ message: `已添加模型「${model.model}」` })
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
    showToast({ message: '已保存修改' })
  }

  function handleActivate(id: string) {
    setActiveId(id)
    batch.exit()
    const model = models.find((item) => item.id === id)
    showToast({ message: `已启用「${model?.model ?? '模型'}」` })
  }

  /** 单条测试：结果直接落在条目上 */
  async function handleTestOne(model: AiModel) {
    setTestingId(model.id)
    const result = await testConnection(model)
    const at = Date.now()
    setModels((current) =>
      current.map((item) => (item.id === model.id ? withResult(model, result, at) : item)),
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
        current.map((item) => (item.id === model.id ? withResult(model, result, at) : item)),
      )
      setProgress({ done: index + 1, total: models.length })
    }
    setTestingId('')
    setTestingAll(false)
    showToast({ message: `测试完成：${ok} 条连通，${models.length - ok} 条没通` })
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
      showToast({ message: '已删除正在启用的模型，AI 助手暂时没有可用模型' })
    } else {
      showToast({ message: `已删除 ${ids.length} 个模型` })
    }
  }

  const busy = testingAll || testingId !== ''

  return (
    <PageShell
      backTo="/me/agent"
      backLabel="助手"
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setFormOpen((open) => !open)
              setEditing(null)
            }}
            className={SOLID_BUTTON}
          >
            {formOpen ? '收起新增' : '＋ 新增模型'}
          </button>
          <button
            type="button"
            disabled={models.length === 0 || busy}
            onClick={() => void handleTestAll()}
            className={`${SOLID_BUTTON} disabled:opacity-40`}
          >
            {testingAll ? `正在测试 ${progress.done}/${progress.total}…` : '测试联通'}
          </button>
          {models.length > 0 && !batch.active && (
            <button type="button" onClick={batch.enter} className={SOLID_BUTTON}>
              批量管理
            </button>
          )}
        </>
      }
    >
      <SettingCard
        title="AI 模型"
        description="让 AI 把随记整理成日记、把拍下来的手写日记转成文字，走的都是这里启用的模型。配置只存在你这台机器上，改完自动保存。"
        badge={<SettingBadge tone={badge.tone}>{badge.text}</SettingBadge>}
      >
        {/* 常驻状态条：现在用哪条、缺什么、下一步做什么 */}
        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="font-mono text-xs break-all text-fg">{summary}</div>
          <div className="mt-0.5 text-xs text-muted">{verdict}</div>
        </div>

        {/* 新增表单就嵌在「新增模型」按钮下面 */}
      {formOpen && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="mb-2 text-xs text-fg">新增一条模型</div>
          <ModelForm
            initial={{ providerId: '', providerName: '', baseUrl: '', model: '', apiKey: '' }}
            submitLabel="添加并保存"
            onSubmit={handleAdd}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}

      {models.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
          还没有模型。点「＋ 新增模型」，挑一家、把 key 粘进去就能用。
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
                      aria-label={selected ? '取消选中' : '选中'}
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
                      <span className="text-xs text-muted">{model.providerName}</span>
                      {isActive && <SettingBadge tone="ok">启用中</SettingBadge>}
                      {!configOk && <SettingBadge tone="bad">还差 key</SettingBadge>}
                    </div>
                    <p className="mt-1 font-mono text-xs break-all text-muted">
                      {model.baseUrl} · {keyMask(model.apiKey)}
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
                          ? '✓ 能识别图片'
                          : model.vision === 'no'
                            ? '✗ 不能识别图片'
                            : '看图能力未测'}
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
                            ? `✓ 通了 · ${test.ms} 毫秒 · ${formatTestAt(test.at)}`
                            : `✗ 没通 · ${formatTestAt(test.at)}`
                          : '还没测过'}
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
                        启用
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canTest(model) || busy}
                      onClick={() => void handleTestOne(model)}
                      className={`${SLIP_BUTTON} text-muted hover:text-fg disabled:opacity-40`}
                    >
                      {testingId === model.id ? '测试中…' : '测一下'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(model)
                        setFormOpen(false)
                      }}
                      className={`${SLIP_BUTTON} text-muted hover:text-fg`}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete([model.id])}
                      className={`${SLIP_BUTTON} text-danger hover:opacity-80`}
                    >
                      删除
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {batch.active && (
        <BatchActions select={batch} ids={selectableIds} unit="个">
          <button
            type="button"
            disabled={batch.count !== 1}
            onClick={() => batch.selected[0] && handleActivate(batch.selected[0])}
            className={BAR_BUTTON}
          >
            设为启用
          </button>
          <button
            type="button"
            disabled={batch.count === 0}
            onClick={() => requestDelete(batch.selected)}
            className={BAR_DANGER}
          >
            删除
          </button>
        </BatchActions>
      )}

      {/* 编辑走弹窗：列表保持不动，改完关掉就能看到新状态 */}
      {editing && (
        <Modal size="lg" onClose={() => setEditing(null)} panelClassName="max-h-[80vh] overflow-y-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-fg">编辑模型</h3>
            <span className="font-mono text-xs text-muted">{editing.providerName}</span>
          </div>
          <ModelForm
            initial={{
              providerId: editing.providerId,
              providerName: editing.providerName,
              baseUrl: editing.baseUrl,
              model: editing.model,
              apiKey: editing.apiKey,
            }}
            submitLabel="保存修改"
            onSubmit={handleEdit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {/* 删的是正在启用的那条：先把风险说清楚，再给硬删的出口 */}
      {pendingDelete && pendingDelete.active && (
        <Modal size="sm" onClose={() => setPendingDelete(null)}>
          <h3 className="text-sm font-medium text-fg">这是正在启用的模型</h3>
          <p className="mt-2 text-xs text-muted">
            删掉它之后，AI 整理成日记、图片导入都会暂时用不了，直到你在列表里启用另一条。
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setPendingDelete(null)} className={OUTLINE_BUTTON}>
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingDelete(null)
                batch.exit()
                showToast({ message: '点列表里任意一条的「启用」，就能换过去' })
              }}
              className={SOLID_BUTTON}
            >
              去启用别的
            </button>
            <button type="button" onClick={confirmDelete} className={SOLID_DANGER}>
              仍然删除
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && !pendingDelete.active && (
        <ConfirmDialog
          title={`删除选中的 ${pendingDelete.ids.length} 个模型？`}
          description="删除后配置会从这台机器上移除；不影响服务商那边的账号和额度。"
          confirmLabel="删除"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      </SettingCard>
    </PageShell>
  )
}
