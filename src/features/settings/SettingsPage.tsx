/**
 * 「设置」菜单：只管应用级的东西——主题、数据备份。
 *
 * 按"主题域"分家之后这里只剩两项：
 *   - 主题 / 数据备份 → 应用级的（这一页）
 *   - 悬浮球 / AI 模型 → 助手相关的（`/me/agent`，见 AgentMenuPage）
 * 跟「助手」那一页各管一摊，免得一页越堆越长。
 */
import { useState } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { accentLabelKey } from '@/app/theme'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import SettingRow from '@/shared/ui/SettingRow'
import PageShell from '@/shared/ui/PageShell'
import { SettingBadge } from '@/shared/ui/SettingCard'
import { totals } from '@/features/diary/diaryRepo'
import { clearAppCache, formatCacheSize } from './cacheService'

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
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const counts = useLiveQuery(() => totals(), [])
  const [cacheOpen, setCacheOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const themeOption = themes.find((item) => item.id === theme)
  const themeLabel = themeOption ? t(themeOption.labelKey) : theme
  const accentKey = accentLabelKey(accent)
  const accentName = accentKey ? t(accentKey) : accent

  async function handleClearCache() {
    setClearing(true)
    try {
      const { bytes } = await clearAppCache()
      showToast({
        message:
          bytes > 0
            ? t('settings.cacheCleared', { size: formatCacheSize(bytes) })
            : t('settings.cacheEmpty'),
      })
    } catch (error) {
      showToast({
        message: t('settings.cacheFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      })
    } finally {
      setClearing(false)
      setCacheOpen(false)
    }
  }

  return (
    <PageShell
      title={t('common.settings')}
      description={t('settings.description')}
      // 菜单也是"里面的一层"，所以同样要有返回：这里回「我的」
      backTo="/me"
      backLabel={t('me.title')}
    >
      <SettingRow
        to="/me/settings/language"
        emoji="🌐"
        title={t('settings.language')}
        hint={t('settings.languageHint')}
        value={<SettingBadge>{t(locale === 'zh' ? 'language.zh' : 'language.en')}</SettingBadge>}
      />
      <SettingRow
        to="/me/settings/theme"
        emoji="🎨"
        title={t('settings.theme')}
        hint={t('settings.themeHint')}
        value={
          <SettingBadge>
            {themeLabel} · {accentName}
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
      <SettingRow
        emoji="🧹"
        title={t('settings.cache')}
        hint={t('settings.cacheHint')}
        value={
          <SettingBadge>
            {clearing ? t('settings.cacheClearing') : t('settings.cacheAction')}
          </SettingBadge>
        }
        onClick={() => setCacheOpen(true)}
      />

      {cacheOpen && (
        <ConfirmDialog
          title={t('settings.cacheConfirmTitle')}
          description={t('settings.cacheConfirmBody')}
          confirmLabel={t('settings.cacheConfirm')}
          tone="brand"
          onConfirm={() => void handleClearCache()}
          onCancel={() => setCacheOpen(false)}
        />
      )}
    </PageShell>
  )
}
