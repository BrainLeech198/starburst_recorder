/**
 * 「公告」二级页：列出官方公告，新的在前。
 *
 * 应用打开时顶部的横幅只是提示，全部公告在这一页。
 * 公告内容来自服务端，本地不存；加载失败时保留错误状态并提供重试入口。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge } from '@/shared/ui/SettingCard'
import { fetchNotices, type Notice } from '@/platform/channel'

function formatTime(at: number, locale: string): string {
  if (!at) return ''
  try {
    return new Date(at).toLocaleString(locale)
  } catch {
    return ''
  }
}

export default function NoticePage() {
  const { t, locale } = useI18n()
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void fetchNotices().then((result) => {
      if (!alive) return
      if (result.ok) setNotices(result.data ?? [])
      else setLoadFailed(true)
    })
    return () => {
      alive = false
    }
  }, [attempt])

  const urgentCount = loadFailed ? null : notices?.filter((item) => item.level === 'urgent').length

  return (
    <PageShell
      title={t('notice.title')}
      description={t('notice.description')}
      backTo="/me"
      backLabel={t('me.title')}
      badge={
        urgentCount === undefined || urgentCount === null ? null : (
          <SettingBadge tone={urgentCount > 0 ? 'bad' : 'plain'}>
            {urgentCount > 0 ? t('notice.urgentCount', { count: urgentCount }) : t('notice.count')}
          </SettingBadge>
        )
      }
    >
      {notices === null ? (
        <SettingCard>
          {loadFailed ? (
            <div className="space-y-3" role="status">
              <p className="text-sm text-danger">{t('notice.loadFailed')}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadFailed(false)
                  setAttempt((value) => value + 1)
                }}
                className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
              >
                {t('notice.retry')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted" role="status">{t('common.loading')}</p>
          )}
        </SettingCard>
      ) : notices.length === 0 ? (
        <SettingCard>
          <div className="flex items-start gap-3" role="status">
            <span aria-hidden="true" className="text-xl">📭</span>
            <div>
              <p className="text-sm font-medium text-fg">{t('notice.empty')}</p>
              <p className="mt-1 text-xs text-muted">{t('notice.emptyHint')}</p>
            </div>
          </div>
        </SettingCard>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => {
            const urgent = notice.level === 'urgent'
            return (
              <div
                key={notice.id}
                className={[
                  'rounded-2xl border p-4',
                  urgent ? 'border-danger/60 bg-danger/10' : 'border-line bg-surface',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {urgent && (
                    <span className="rounded-full bg-danger px-2 py-0.5 text-xs text-on-danger">
                      {t('notice.urgentBadge')}
                    </span>
                  )}
                  <h2 className="text-sm font-medium">{notice.title}</h2>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                  {notice.body}
                </p>
                {notice.createdAt > 0 && (
                  <p className="mt-2 text-xs text-muted">{formatTime(notice.createdAt, locale)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
