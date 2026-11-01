/**
 * 对话里的选择题卡片：模型用 ask_user 递过来的 2–4 个选项。
 * 单选点一下就继续；多选先勾再确认。选完卡片留痕，不重复问。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { choiceTile, SOLID_SMALL_BUTTON } from '@/shared/ui/buttonStyles'
import type { ChatQuestionState } from './assistantChatStore'

export default function AssistantQuestionCard({
  state,
  busy,
  onAnswer,
}: {
  state: ChatQuestionState
  busy: boolean
  onAnswer: (selected: string[]) => void
}) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<string[]>([])

  if (state.status !== 'open') {
    return (
      <div className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs">
        {state.header !== '' && <span className="text-[10px] text-muted">{state.header}</span>}
        <p className="m-0 mt-0.5 text-sm text-fg">{state.question}</p>
        <p className="m-0 mt-1 text-muted">
          {state.selected && state.selected.length > 0
            ? t('assistant.questionAnswered', { choices: state.selected.join('、') })
            : t('assistant.questionSkipped')}
        </p>
      </div>
    )
  }

  function toggle(label: string) {
    setPicked((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }

  return (
    <div
      className="w-full rounded-xl border border-brand/40 bg-surface p-3"
      role="group"
      aria-label={state.question}
    >
      {state.header !== '' && (
        <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
          {state.header}
        </span>
      )}
      <p className="m-0 mt-1 text-sm text-fg">{state.question}</p>
      <div className="mt-2 flex flex-col gap-2">
        {state.options.map((option) => {
          const active = state.multiSelect ? picked.includes(option.label) : false
          return (
            <button
              key={option.label}
              type="button"
              disabled={busy}
              aria-pressed={state.multiSelect ? active : undefined}
              onClick={() =>
                state.multiSelect ? toggle(option.label) : onAnswer([option.label])
              }
              className={choiceTile(active, 'w-full px-3 py-2 text-left')}
            >
              <span className="block text-sm text-fg">
                {state.multiSelect && (active ? '✓ ' : '')}
                {option.label}
              </span>
              {option.description !== undefined && (
                <span className="mt-0.5 block text-[11px] text-muted">{option.description}</span>
              )}
            </button>
          )
        })}
      </div>
      {state.multiSelect && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">{t('assistant.questionMultiHint')}</span>
          <button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={() => onAnswer(picked)}
            className={SOLID_SMALL_BUTTON + ' disabled:opacity-40'}
          >
            {t('assistant.questionConfirm')}
          </button>
        </div>
      )}
    </div>
  )
}
