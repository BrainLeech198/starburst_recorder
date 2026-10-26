/**
 * 改稿对话条：AI 整理和 AI 润色共用。
 *
 * 只负责收集这一轮的要求、列出之前提过的要求；正文怎么替换由外面的弹窗决定。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { FIELD } from '@/shared/ui/inputStyles'
import type { RevisionTurn } from './aiRevision'

export default function RevisionChat({
  turns,
  busy,
  error,
  onSend,
}: {
  turns: RevisionTurn[]
  busy: boolean
  error: string
  onSend: (request: string) => void
}) {
  const { t } = useI18n()
  const [request, setRequest] = useState('')

  function submit() {
    const text = request.trim()
    if (text === '' || busy) return
    onSend(text)
    setRequest('')
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="text-xs font-medium text-fg">{t('ai.chatTitle')}</div>
      <p className="mt-1 text-xs text-muted">{t('ai.chatHint')}</p>

      {turns.length > 0 && (
        <ol className="mt-2 space-y-1 text-xs text-muted">
          {turns.map((turn, index) => (
            <li key={index} className="truncate">
              <span className="text-fg">{t('ai.chatYou')}：</span>
              {turn.request}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={t('ai.chatPlaceholder')}
          disabled={busy}
          className={`min-w-0 flex-1 px-3 py-1.5 ${FIELD} disabled:opacity-60`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || request.trim() === ''}
          className="shrink-0 rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          {t('ai.chatSend')}
        </button>
      </div>

      {busy && <p className="mt-2 text-xs text-muted">{t('ai.chatBusy')}</p>}
      {!busy && error !== '' && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
