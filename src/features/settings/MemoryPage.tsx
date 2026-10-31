/**
 * 「助手记忆」：它长期记得的偏好、目标、习惯和事实。
 *
 * 对话里让它「记住…」会先出确认卡，确认后落在这里；
 * 也可以在这里手写、改分类、删掉。清空只影响记忆，不动任何日记和记录。
 */
import { useState } from 'react'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge } from '@/shared/ui/SettingCard'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, SOLID_DANGER } from '@/shared/ui/buttonStyles'
import {
  addMemory,
  clearMemories,
  loadMemories,
  removeMemory,
  updateMemory,
  MAX_MEMORY_TEXT,
  type AssistantMemory,
  type AssistantMemoryKind,
} from '@/features/assistant/assistantMemory'

const KIND_KEYS: Record<AssistantMemoryKind, MessageKey> = {
  preference: 'memory.kind.preference',
  goal: 'memory.kind.goal',
  habit: 'memory.kind.habit',
  fact: 'memory.kind.fact',
}

const KINDS: AssistantMemoryKind[] = ['preference', 'goal', 'habit', 'fact']

export default function MemoryPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [list, setList] = useState<AssistantMemory[]>(loadMemories)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<AssistantMemoryKind>('preference')
  const [confirmClear, setConfirmClear] = useState(false)

  function refresh() {
    setList(loadMemories())
  }

  function handleAdd() {
    const value = text.trim()
    if (value === '') return
    const result = addMemory({ text: value, kind, source: 'user' })
    if (!result) return
    setText('')
    refresh()
    showToast({ message: t('memory.saved') })
  }

  function handleRemove(id: string) {
    removeMemory(id)
    refresh()
    showToast({ message: t('memory.deleted') })
  }

  function cycleKind(item: AssistantMemory) {
    const next = KINDS[(KINDS.indexOf(item.kind) + 1) % KINDS.length]
    updateMemory(item.id, { kind: next })
    refresh()
  }

  function handleClear() {
    setConfirmClear(false)
    clearMemories()
    refresh()
    showToast({ message: t('memory.cleared') })
  }

  return (
    <PageShell
      title={t('memory.title')}
      description={t('memory.description')}
      backTo="/me/agent"
      backLabel={t('me.agent')}
    >
      <SettingCard
        title={t('memory.title')}
        description={t('memory.description')}
        badge={<SettingBadge>{t('agent.memoryCount', { count: list.length })}</SettingBadge>}
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  kind === option
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-line text-muted hover:text-fg'
                }`}
              >
                {t(KIND_KEYS[option])}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_MEMORY_TEXT))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) handleAdd()
              }}
              placeholder={t('memory.placeholder')}
              aria-label={t('memory.placeholder')}
              className={INPUT + ' flex-1'}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={text.trim() === ''}
              className={`${SOLID_BUTTON} disabled:opacity-40`}
            >
              {t('memory.add')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {t('memory.limit', { max: MAX_MEMORY_TEXT })}
          </p>
        </div>

        {list.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
            {t('memory.empty')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {list.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-line bg-surface px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cycleKind(item)}
                        title={t('memory.changeKind')}
                        className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] text-brand"
                      >
                        {t(KIND_KEYS[item.kind])}
                      </button>
                      <span className="text-[10px] text-muted">
                        {t(item.source === 'assistant' ? 'memory.source.assistant' : 'memory.source.user')}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">
                      {item.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="shrink-0 text-[11px] text-muted transition-colors hover:text-danger"
                  >
                    {t('memory.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {list.length > 0 && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => setConfirmClear(true)} className={SOLID_DANGER}>
              {t('memory.clear')}
            </button>
          </div>
        )}
      </SettingCard>

      {confirmClear && (
        <ConfirmDialog
          title={t('memory.clearConfirmTitle')}
          description={t('memory.clearConfirmBody')}
          confirmLabel={t('memory.clearConfirm')}
          tone="danger"
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </PageShell>
  )
}
