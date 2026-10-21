/**
 * 「我的」：账户占位 + 两个入口——设置（应用级）与助手（星芒助手自己的那一套）。
 *
 * 两个入口的说明写清"里面有什么"，不然"设置 / 助手"这种抽象名字点进去才知道，
 * 白白多一次跳转。
 */
import SettingRow from '@/shared/ui/SettingRow'
import { useI18n } from '@/shared/i18n/context'

export default function MePage() {
  const { t } = useI18n()

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
      </div>

      <p className="mt-4 text-xs text-muted">{t('me.futureNote')}</p>
    </div>
  )
}
