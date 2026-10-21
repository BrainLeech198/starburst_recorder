/**
 * 「设置」菜单：只管应用级的东西——主题、数据备份。
 *
 * 按"主题域"分家之后这里只剩两项：
 *   - 主题 / 数据备份 → 应用级的（这一页）
 *   - 悬浮球 / AI 模型 → 助手相关的（`/me/agent`，见 AgentMenuPage）
 * 跟「助手」那一页各管一摊，免得一页越堆越长。
 */
import { useLiveQuery } from '@/core/db/live'
import { useTheme } from '@/app/providers/ThemeProvider'
import { accentLabel } from '@/app/theme'
import { useI18n } from '@/shared/i18n/context'
import SettingRow from '@/shared/ui/SettingRow'
import PageShell from '@/shared/ui/PageShell'
import { SettingBadge } from '@/shared/ui/SettingCard'
import { totals } from '@/features/diary/diaryRepo'

/** 菜单右侧那个小圆点：一眼看出当前主题色 */
function AccentDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

export default function SettingsPage() {
  const { theme, themes, accent } = useTheme()
  const { t } = useI18n()
  const counts = useLiveQuery(() => totals(), [])
  const themeLabel = themes.find((item) => item.id === theme)?.label ?? theme

  return (
    <PageShell
      title={t('common.settings')}
      description={t('settings.description')}
      // 菜单也是"里面的一层"，所以同样要有返回：这里回「我的」
      backTo="/me"
      backLabel={t('me.title')}
    >
      <SettingRow
        to="/me/settings/theme"
        emoji="🎨"
        title={t('settings.theme')}
        hint={t('settings.themeHint')}
        value={
          <SettingBadge>
            {themeLabel} · {accentLabel(accent)}
            <AccentDot color={accent} />
          </SettingBadge>
        }
      />
      <SettingRow
        to="/me/settings/data"
        emoji="💾"
        title={t('settings.data')}
        hint={t('settings.dataHint')}
        value={
          <SettingBadge>
            {t('settings.dataCount', { entries: counts?.entries ?? 0, stamps: counts?.stamps ?? 0 })}
          </SettingBadge>
        }
      />
    </PageShell>
  )
}
