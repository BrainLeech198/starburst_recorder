/**
 * 公告横幅：应用打开时出现在顶部。
 *
 * **为什么放在应用里而不是只靠推送**：Web Push 只有浏览器有，
 * 安卓与 Windows 安装包的用户收不到任何推送。对他们来说，
 * 这个横幅是唯一能收到「紧急公告」的入口——所以它必须是三端通吃的，
 * 也就不依赖任何推送能力。
 *
 * 交互：
 * - 普通公告：点标题展开正文，再点收起
 * - 紧急公告：红色描边 + 醒目底色，且不会自己消失
 */
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { fetchNotices, type Notice } from '@/platform/channel'
import { markNoticeSeen, pickNoticeToShow } from './noticeState'

export default function NoticeBanner() {
  const { t } = useI18n()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    void fetchNotices().then((list) => {
      if (!alive) return
      const picked = pickNoticeToShow(list)
      if (picked) setNotice(picked)
    })
    return () => {
      alive = false
    }
  }, [])

  const dismiss = useCallback(() => {
    if (!notice) return
    markNoticeSeen(notice)
    setNotice(null)
    setExpanded(false)
  }, [notice])

  if (!notice) return null

  const urgent = notice.level === 'urgent'

  return (
    <div
      role="status"
      className={[
        'rounded-xl border p-4',
        urgent ? 'border-danger/60 bg-danger/10' : 'border-line bg-surface',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-base leading-none">
          {urgent ? '⚠️' : '📣'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {urgent && (
              <span className="rounded-full bg-danger px-2 py-0.5 text-xs text-on-danger">
                {t('notice.urgentBadge')}
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="min-w-0 text-left text-sm font-medium"
            >
              {notice.title}
            </button>
          </div>
          {expanded && (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
              {notice.body}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={dismiss}
          className="shrink-0 rounded-md px-1 text-muted transition-colors hover:text-brand"
        >
          ×
        </button>
      </div>
    </div>
  )
}
