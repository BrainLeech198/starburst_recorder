/**
 * 「公告」二级页：列出官方公告，新的在前。
 *
 * 应用打开时顶部的横幅只是提示，全部公告在这一页。
 * 公告内容来自服务端，本地不存——所以断网时看到的是上一次打开时留在页面里的内容。
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

  useEffect(() => {
    let alive = true
    void fetchNotices().then((list) => {
      if (alive) setNotices(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const urgentCount = notices?.filter((item) => item.level === 'urgent').length ?? 0

  return (
    <PageShell
      title={t('notice.title')}
      description={t('notice.description')}
      backTo="/me"
      backLabel={t('me.title')}
      badge={
        <SettingBadge tone={urgentCount > 0 ? 'bad' : 'plain'}>
          {urgentCount > 0 ? t('notice.urgentCount', { count: urgentCount }) : t('notice.count')}
        </SettingBadge>
      }
    >
      {notices === null ? (
        <SettingCard>
          <p className="text-sm text-muted">{t('common.loading')}</p>
        </SettingCard>
      ) : notices.length === 0 ? (
        <SettingCard>
          <p className="text-sm text-muted">{t('notice.empty')}</p>
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
