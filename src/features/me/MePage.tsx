/**
 * 「我的」：本地账户占位 + 三个入口（设置、助手、版本）。
 *
 * 版本页里放着检查更新和「进入官网」；有新版时这里点一个红点，
 * 平时不打扰，但不至于让人翻不到。
 */
import SettingRow from '@/shared/ui/SettingRow'
import { useI18n } from '@/shared/i18n/context'
import { APP_VERSION } from '@/core/version'
import { useUpdate } from '@/features/update/UpdateProvider'

export default function MePage() {
  const { t } = useI18n()
  const { info } = useUpdate()

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-lg font-medium">{t('me.title')}</h1>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface-2 text-xs text-muted">
          {t('me.avatar')}
        </div>
        <div>
          <div className="text-base font-medium">{t('me.localAccount')}</div>
          <div className="mt-1 text-xs text-muted">{t('me.localAccountHint')}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <SettingRow
          to="/me/settings"
          emoji="⚙️"
          title={t('me.settings')}
          hint={t('me.settingsHint')}
        />
        <SettingRow to="/me/agent" emoji="✨" title={t('me.agent')} hint={t('me.agentHint')} />
        <SettingRow
          to="/me/version"
          emoji="🏷️"
          title={t('version.title')}
          hint={
            info
              ? t('update.found', { version: info.version })
              : t('update.checkHint', { version: APP_VERSION })
          }
          value={
            info ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-danger"
                title={t('update.found', { version: info.version })}
              />
            ) : undefined
          }
        />
      </div>

      <p className="mt-4 text-xs text-muted">{t('me.futureNote')}</p>
    </div>
  )
}
