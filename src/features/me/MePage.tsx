/**
 * 「我的」：账户占位 + 两个入口——设置（应用级）与助手（星芒助手自己的那一套）。
 *
 * 两个入口的说明写清"里面有什么"，不然"设置 / 助手"这种抽象名字点进去才知道，
 * 白白多一次跳转。
 */
import SettingRow from '@/shared/ui/SettingRow'
import { useI18n } from '@/shared/i18n/context'
import { APP_VERSION } from '@/core/version'
import { useUpdate } from '@/features/update/UpdateProvider'

export default function MePage() {
  const { t } = useI18n()
  const { info, checking, check } = useUpdate()

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

        {/* 有新版时点一个红点：平时不打扰，但也别让人翻不到 */}
        <button
          type="button"
          onClick={check}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-brand"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ⬇️
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              {t('update.check')}
              {info && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-danger"
                  title={t('update.found', { version: info.version })}
                />
              )}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {info
                ? t('update.found', { version: info.version })
                : t('update.checkHint', { version: APP_VERSION })}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">
            {checking ? '…' : '›'}
          </span>
        </button>
      </div>

      <p className="mt-4 text-xs text-muted">{t('me.futureNote')}</p>
    </div>
  )
}
