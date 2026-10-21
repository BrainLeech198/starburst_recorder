import type { MessageKey } from '@/shared/i18n/messages/zh'

export type ThemeId = 'deep' | 'light'

export const THEMES: { id: ThemeId; labelKey: MessageKey }[] = [
  { id: 'deep', labelKey: 'theme.deep' },
  { id: 'light', labelKey: 'theme.light' },
]

export const THEME_KEY = 'starburst.theme'
export const ACCENT_KEY = 'starburst.accent'

// 主题色色板（同时决定强调色、导航背景和悬浮球颜色）
// 带名字是因为色值（#6ee7ff）对使用者没有意义、也不好念——有名字才说得清"我用的是哪个"
export const ACCENT_COLORS: { value: string; labelKey: MessageKey }[] = [
  { value: '#6ee7ff', labelKey: 'accent.cyan' },
  { value: '#7dd3a0', labelKey: 'accent.mint' },
  { value: '#f0abfc', labelKey: 'accent.lilac' },
  { value: '#fca5a5', labelKey: 'accent.rose' },
  { value: '#fcd34d', labelKey: 'accent.wheat' },
  { value: '#a5b4fc', labelKey: 'accent.haze' },
]
export const DEFAULT_ACCENT = ACCENT_COLORS[0].value

/** 色值 → 文案 key；认不出就返回 null，调用方回退成原始色值 */
export function accentLabelKey(value: string): MessageKey | null {
  return ACCENT_COLORS.find((item) => item.value === value)?.labelKey ?? null
}

export function readTheme(): ThemeId {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'deep'
}

export function readAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT
}
