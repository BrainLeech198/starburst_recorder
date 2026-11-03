/**
 * 对话导出弹窗：选格式、选范围、勾选要不要把工具轨迹和动作卡片一起带走。
 * 保存走平台统一的 saveTextFile，安卓会弹系统选择器。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { saveTextFile, saveBinaryFile, describeSave } from '@/platform/saveFile'
import type { ChatMessageRecord } from './assistantChatStore'
import {
  buildChatExport,
  chatExportFilename,
  type ChatExportFormat,
} from './chatExport'
import { chatImageFilename, renderChatImage } from './chatImage'

const FORMAT_MIME: Record<ChatExportFormat | 'png', string> = {
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  json: 'application/json;charset=utf-8',
  png: 'image/png',
}

const CHIP =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 text-xs transition-colors md:min-h-8'

export default function AssistantExportDialog({
  messages,
  title,
  selectedIds,
  onClose,
}: {
  messages: ChatMessageRecord[]
  title: string
  /** 从多选进来时带上选中的消息 id */
  selectedIds: string[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const hasSelection = selectedIds.length > 0
  const [scope, setScope] = useState<'all' | 'selected'>(hasSelection ? 'selected' : 'all')
  const [format, setFormat] = useState<ChatExportFormat | 'png'>('md')
  const [includeTrace, setIncludeTrace] = useState(false)
  const [includeActions, setIncludeActions] = useState(true)
  const [saving, setSaving] = useState(false)

  const formats: { value: ChatExportFormat | 'png'; label: string }[] = [
    { value: 'md', label: 'Markdown' },
    { value: 'txt', label: 'TXT' },
    { value: 'json', label: 'JSON' },
    { value: 'png', label: t('assistant.exportImage') },
  ]

  const selected = new Set(selectedIds)
  const chosen = scope === 'selected' ? messages.filter((item) => selected.has(item.id)) : messages
  const labels = {
    user: t('assistant.exportUser'),
    assistant: t('assistant.exportAssistant'),
    tools: t('assistant.exportTrace'),
    actions: t('assistant.exportActions'),
    attachments: t('assistant.exportAttachments'),
    exportedAt: t('assistant.exportedAt'),
  }

  async function save() {
    if (saving) return
    if (chosen.length === 0) {
      showToast({ message: t('assistant.exportEmpty') })
      return
    }
    setSaving(true)
    try {
      if (format === 'png') {
        try {
          const blob = await renderChatImage({
            title: title.trim() || t('assistant.untitled'),
            messages: chosen,
            includeTrace,
            includeActions,
            labels,
          })
          const filename = chatImageFilename()
          const outcome = await saveBinaryFile({
            filename,
            mime: 'image/png',
            bytes: new Uint8Array(await blob.arrayBuffer()),
          })
          showToast({ message: describeSave(outcome, filename, t) })
          if (outcome.kind !== 'canceled') onClose()
        } catch {
          showToast({ message: t('assistant.exportImageFailed') })
        }
        return
      }

      const content = buildChatExport({
        title: title.trim() || t('assistant.untitled'),
        messages: chosen,
        format,
        includeTrace,
        includeActions,
        labels,
      })
      const filename = chatExportFilename(format)
      const outcome = await saveTextFile({ filename, mime: FORMAT_MIME[format], content })
      showToast({ message: describeSave(outcome, filename, t) })
      if (outcome.kind !== 'canceled') onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal size="sm" label={t('assistant.exportTitle')} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-medium">{t('assistant.exportTitle')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg md:h-7 md:w-7"
        >
          ✕
        </button>
      </div>

      <p className="mt-1 text-[11px] text-muted">
        {t('assistant.sessionMeta', { n: chosen.length })}
      </p>

      <p className="mt-3 text-xs text-muted">{t('assistant.exportFormat')}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {formats.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFormat(item.value)}
            className={`${CHIP} ${
              format === item.value
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-line text-muted hover:text-fg'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {hasSelection && (
        <>
          <p className="mt-3 text-xs text-muted">{t('assistant.exportScope')}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`${CHIP} ${
                scope === 'all'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-muted hover:text-fg'
              }`}
            >
              {t('assistant.exportAll')}
            </button>
            <button
              type="button"
              onClick={() => setScope('selected')}
              className={`${CHIP} ${
                scope === 'selected'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-muted hover:text-fg'
              }`}
            >
              {t('assistant.exportSelected', { n: selectedIds.length })}
            </button>
          </div>
        </>
      )}

      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={includeTrace}
          onChange={(event) => setIncludeTrace(event.target.checked)}
          className="h-5 w-5 accent-[var(--color-brand)] md:h-4 md:w-4"
        />
        {t('assistant.exportTrace')}
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={includeActions}
          onChange={(event) => setIncludeActions(event.target.checked)}
          className="h-5 w-5 accent-[var(--color-brand)] md:h-4 md:w-4"
        />
        {t('assistant.exportActions')}
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || chosen.length === 0}
          className={`${SOLID_BUTTON} disabled:opacity-50`}
        >
          {t('assistant.export')}
        </button>
      </div>
    </Modal>
  )
}
