/**
 * 「主题」二级页：明暗模式 + 主题色（+ 桌面端才有的窗口尺寸）。
 *
 * 页面名与当前值交给页头（见 PageShell），卡片里只剩两个分组，所以卡片不再自带标题。
 */
import { useTheme } from '../../app/providers/ThemeProvider'
import { ACCENT_COLORS, accentLabel } from '../../app/theme'
import SettingCard, { SettingBadge, SettingGroup } from '../../shared/ui/SettingCard'
import PageShell from '../../shared/ui/PageShell'
import { choiceTile } from '../../shared/ui/buttonStyles'
import { WindowCard } from './WindowCard'

/** 明暗主题的标记：光看两个字不容易一眼分清 */
const THEME_MARK: Record<string, string> = { deep: '🌌', light: '☀️' }

export default function AppearancePage() {
  const { theme, setTheme, themes, accent, setAccent } = useTheme()
  const themeLabel = themes.find((item) => item.id === theme)?.label ?? theme

  return (
    <PageShell
      title="主题"
      badge={
        <SettingBadge>
          {themeLabel} · {accentLabel(accent)}
        </SettingBadge>
      }
      description="换主题色的时候，导航背景、强调元素和悬浮球的颜色会一起变。"
    >
      <SettingCard>
        <SettingGroup label="明暗" first>
          <div className="grid grid-cols-2 gap-2">
            {themes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheme(item.id)}
                className={choiceTile(theme === item.id, 'flex items-center gap-2 px-3 py-2')}
              >
                <span aria-hidden="true">{THEME_MARK[item.id] ?? '●'}</span>
                {item.label}
              </button>
            ))}
          </div>
        </SettingGroup>

        <SettingGroup label="主题色">
          <div className="grid grid-cols-6 gap-2">
            {ACCENT_COLORS.map(({ value, label }) => {
              const active = accent === value
              return (
                <button
                  key={value}
                  type="button"
                  title={`${label} ${value}`}
                  aria-label={`主题色 ${label}`}
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
