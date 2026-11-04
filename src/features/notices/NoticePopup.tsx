/**
 * 应用启动公告弹窗。
 *
 * 每次应用加载时读取公开公告，沿用本机确认状态挑选一条；紧急公告优先。
 * 关闭只暂缓；用户点「确认收到」后，这条公告才在本机标记为已确认。
 */
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { fetchNotices, type Notice } from '@/platform/channel'
import Modal from '@/shared/ui/Modal'
import { acknowledgeNotice, pickNoticeToShow } from './noticeState'

export default function NoticePopup() {
  const { t } = useI18n()
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let alive = true
    void fetchNotices().then((result) => {
      if (!alive || !result.ok) return
      const picked = pickNoticeToShow(result.data ?? [])
      if (picked) setNotice(picked)
    })
    return () => {
      alive = false
    }
  }, [])

  const dismiss = useCallback(() => {
    setNotice(null)
  }, [])

  const acknowledge = useCallback(() => {
    if (!notice) return
    acknowledgeNotice(notice)
    setNotice(null)
  }, [notice])

  if (!notice) return null

  const urgent = notice.level === 'urgent'

  return (
    <Modal size="sm" label={t('notice.title')} onClose={dismiss}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-xl leading-none">
          {urgent ? '⚠️' : '📣'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {urgent && (
              <span className="rounded-full bg-danger px-2 py-0.5 text-xs text-on-danger">
                {t('notice.urgentBadge')}
              </span>
            )}
            <h2 className="text-base font-semibold text-fg">{notice.title}</h2>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {notice.body}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">{t('notice.dismissHint')}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
        >
          {t('common.close')}
        </button>
        <button
          type="button"
          onClick={acknowledge}
          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand transition hover:opacity-90"
        >
          {t('notice.confirmReceipt')}
        </button>
      </div>
    </Modal>
  )
}
