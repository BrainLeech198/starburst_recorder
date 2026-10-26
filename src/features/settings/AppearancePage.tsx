/**
 * 「主题」二级页：明暗模式 + 主题色（+ 桌面端才有的窗口尺寸）。
 *
 * 页面名与当前值交给页头（见 PageShell），卡片里只剩两个分组，所以卡片不再自带标题。
 */
import { useTheme } from '@/app/providers/ThemeProvider'
import { ACCENT_COLORS, accentLabelKey, themeMark } from '@/app/theme'
import { useI18n } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { WindowCard } from './WindowCard'

export default function AppearancePage() {
  const { theme, setTheme, themes, accent, setAccent } = useTheme()
  const { t } = useI18n()
  const themeOption = themes.find((item) => item.id === theme)
  const themeLabel = themeOption ? t(themeOption.labelKey) : theme
  const accentKey = accentLabelKey(accent)
  const accentName = accentKey ? t(accentKey) : accent

  return (
    <PageShell
      title={t('settings.theme')}
      badge={
        <SettingBadge>
          {themeLabel} · {accentName}
        </SettingBadge>
      }
      description={t('appearance.description')}
    >
      <SettingCard>
        <SettingGroup label={t('appearance.mode')} first>
          {/* 每个主题给一张缩略图：光看名字想象不出底色，看色块一眼就能挑 */}
          <div className="grid grid-cols-3 gap-2">
            {themes.map((item) => {
              const active = theme === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(item.id)}
                  className={[
                    'overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
                    active
                      ? 'border-brand shadow-sm ring-2 ring-brand/30'
                      : 'border-line hover:border-muted hover:shadow-sm',
                  ].join(' ')}
                >
                  <span aria-hidden="true" className="flex h-11 w-full">
                    <span
                      style={{ backgroundColor: item.swatch[0] }}
                      className="h-full flex-1"
                    />
                    <span
                      style={{ backgroundColor: item.swatch[1] }}
                      className="h-full flex-1"
                    />
                    <span
                      style={{ backgroundColor: item.swatch[2] }}
                      className="h-full w-2.5"
                    />
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1.5">
                    <span aria-hidden="true" className="text-sm leading-none">
                      {themeMark(item.id)}
                    </span>
                    <span
                      className={active ? 'text-xs font-medium text-brand' : 'text-xs text-muted'}
                    >
                      {t(item.labelKey)}
                    </span>
                    {active && (
                      <span aria-hidden="true" className="ml-auto text-xs text-brand">
                        ✓
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </SettingGroup>

        <SettingGroup label={t('appearance.accent')}>
          <div className="grid grid-cols-6 gap-2">
            {ACCENT_COLORS.map(({ value, labelKey }) => {
              const active = accent === value
              const label = t(labelKey)
              return (
                <button
                  key={value}
                  type="button"
                  title={`${label} ${value}`}
                  aria-label={t('appearance.accentAria', { label })}
                  onClick={() => setAccent(value)}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    style={{ backgroundColor: value }}
                    className={[
                      // 描边必须留着：色块自己不发亮，浅色模式下没边就跟卡片糊成一片
                      'grid h-9 w-full place-items-center rounded-lg border border-line transition-all',
                      active
                        ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface'
                        : 'hover:opacity-80',
                    ].join(' ')}
                  >
                    {/* 色块本身颜色不定，所以勾用一个半透明黑底：深浅模式、明暗色块都压得住 */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="grid h-5 w-5 place-items-center rounded-full bg-black/35 text-xs text-white"
                      >
                        ✓
                      </span>
                    )}
                  </span>
                  {/* 名字放在色块下面：色值没法念，名字才能说清"我用的是哪个" */}
                  <span className={active ? 'text-xs text-brand' : 'text-xs text-muted'}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </SettingGroup>
      </SettingCard>

      {/* 桌面端才有；浏览器里它自己会返回 null */}
      <WindowCard />
    </PageShell>
  )
}
