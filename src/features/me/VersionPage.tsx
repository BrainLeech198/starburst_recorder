/**
 * 「版本」：检查更新 + 进入官网。
 *
 * 检查更新的结果分两种：有新版就把弹窗拉起来（下载、稍后都在那里），
 * 没新版就只更新这一行文字，不打扰。官网走系统浏览器，不在应用里开页。
 */
import { APP_VERSION } from '@/core/version'
import { SITE_URL } from '@/core/links'
import { openExternal } from '@/platform/openExternal'
import { useUpdate } from '@/features/update/UpdateProvider'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge } from '@/shared/ui/SettingCard'

export default function VersionPage() {
  const { t } = useI18n()
  const { info, checking, check } = useUpdate()

  const status = checking
    ? t('update.checking')
    : info
      ? t('update.found', { version: info.version })
      : t('update.latest', { version: APP_VERSION })

  return (
    <PageShell
      title={t('version.title')}
      badge={<SettingBadge>{APP_VERSION}</SettingBadge>}
      description={t('version.description')}
      backTo="/me"
      backLabel={t('me.title')}
    >
      <SettingCard>
        <div className="divide-y divide-line">
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:text-brand disabled:opacity-60"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ⬇️
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {t('update.check')}
                {info && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-danger" />}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{status}</span>
            </span>
            <span aria-hidden="true" className="text-muted">
              {checking ? '…' : '›'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void openExternal(SITE_URL)}
            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:text-brand"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              🌐
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t('update.site')}</span>
              <span className="mt-0.5 block text-xs text-muted">{t('update.siteHint')}</span>
            </span>
            <span aria-hidden="true" className="text-muted">
              ↗
            </span>
          </button>
        </div>
      </SettingCard>

      <p className="text-xs text-muted">{t('version.footnote')}</p>
    </PageShell>
  )
}
