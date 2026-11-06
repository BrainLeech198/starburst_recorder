/**
 * 「给官方反馈」二级页：写一段话提交给作者。
 *
 * 刻意做得很简单：一个输入框 + 一个发送按钮，没有工单号、没有分类、
 * 不用注册。反馈内容连同提交时间存在服务端，作者用管理脚本查看。
 *
 * 反馈**不进备份**：它一旦发出去就已经在服务端了，本地再留一份没有意义。
 */
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingGroup } from '@/shared/ui/SettingCard'
import { INPUT } from '@/shared/ui/inputStyles'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { fetchFeedbackHistory, submitFeedback, type FeedbackRecord } from '@/platform/channel'

/** 正文上限。与服务端一致，超出的部分会被截断 */
const MAX_LENGTH = 4000

export default function FeedbackPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<FeedbackRecord[]>([])
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')

  const loadHistory = useCallback(async () => {
    setHistoryState('loading')
    const result = await fetchFeedbackHistory()
    if (result.ok) {
      setHistory(result.data ?? [])
      setHistoryState('ready')
    } else {
      setHistoryState('error')
    }
  }, [])

  useEffect(() => {
    let disposed = false
    void fetchFeedbackHistory().then((result) => {
      if (disposed) return
      if (result.ok) {
        setHistory(result.data ?? [])
        setHistoryState('ready')
      } else {
        setHistoryState('error')
      }
    })
    return () => { disposed = true }
  }, [])

  function feedbackTime(timestamp: number) {
    return new Date(timestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  async function handleSubmit() {
    const body = text.trim()
    if (!body) {
      showToast({ message: t('feedback.empty') })
      return
    }
    setBusy(true)
    try {
      const result = await submitFeedback(body)
      if (result.ok) {
        setText('')
        showToast({ message: t('feedback.sent') })
        await loadHistory()
      } else {
        const message = result.error === 'feedback weekly limit reached'
          ? t('feedback.weeklyLimit')
          : result.error === 'feedback client id unavailable'
            ? t('feedback.identityUnavailable')
            : t('feedback.failed')
        showToast({ message })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t('feedback.title')}
      description={t('feedback.description')}
      backTo="/me/settings"
      backLabel={t('common.settings')}
    >
      <SettingCard>
        <SettingGroup label={t('feedback.inputGroup')} first>
          <textarea
            value={text}
            rows={6}
            maxLength={MAX_LENGTH}
            placeholder={t('feedback.placeholder')}
            onChange={(event) => setText(event.target.value)}
            className={`${INPUT} resize-y leading-relaxed`}
          />
          <p className="mt-2 text-xs text-muted">
            {t('feedback.counter', { count: text.length, max: MAX_LENGTH })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t('feedback.limitHint')}</p>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || text.trim() === ''}
            className={`${SOLID_BUTTON} mt-3 w-full`}
          >
            {busy ? t('feedback.sending') : t('feedback.send')}
          </button>
        </SettingGroup>
      </SettingCard>

      <SettingCard>
        <SettingGroup label={t('feedback.history')} first>
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyState === 'loading'}
              className={`${GHOST_BUTTON} shrink-0 px-3 py-2 text-xs`}
            >
              {t('feedback.historyRefresh')}
            </button>
          </div>
          {historyState === 'loading' ? (
            <p className="text-sm text-muted" role="status">{t('feedback.historyLoading')}</p>
          ) : historyState === 'error' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted" role="alert">{t('feedback.historyFailed')}</p>
              <button type="button" onClick={() => void loadHistory()} className={`${GHOST_BUTTON} px-3 py-2 text-xs`}>
                {t('feedback.historyRefresh')}
              </button>
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">{t('feedback.historyEmpty')}</p>
          ) : (
            <ul className="grid gap-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-xl border border-line bg-surface/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                      {t(item.status === 'in_progress'
                        ? 'feedback.status.inProgress'
                        : item.status === 'resolved'
                          ? 'feedback.status.resolved'
                          : 'feedback.status.received')}
                    </span>
                    <time className="text-xs text-muted" dateTime={new Date(item.createdAt).toISOString()}>
                      {t('feedback.submittedAt', { time: feedbackTime(item.createdAt) })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p>
                  {item.statusUpdatedAt && item.statusUpdatedAt > item.createdAt && (
                    <p className="mt-2 text-xs text-muted">
                      {t('feedback.statusUpdatedAt', { time: feedbackTime(item.statusUpdatedAt) })}
                    </p>
                  )}
                  {item.developerReply && (
                    <div className="mt-3 rounded-lg border border-brand/20 bg-surface-2 p-3">
                      <p className="mb-1 text-xs font-medium text-brand">{t('feedback.developerReply')}</p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.developerReply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
