export type ThemeId = 'deep' | 'light'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'deep', label: '深空' },
  { id: 'light', label: '浅色' },
]

export const THEME_KEY = 'starburst.theme'
export const ACCENT_KEY = 'starburst.accent'

// 主题色色板（同时决定强调色、导航背景和悬浮球颜色）
// 带中文名是因为色值（#6ee7ff）对使用者没有意义、也不好念——有名字才说得清"我用的是哪个"
export const ACCENT_COLORS: { value: string; label: string }[] = [
  { value: '#6ee7ff', label: '青' },
  { value: '#7dd3a0', label: '薄荷' },
  { value: '#f0abfc', label: '藕荷' },
  { value: '#fca5a5', label: '曙红' },
  { value: '#fcd34d', label: '麦黄' },
  { value: '#a5b4fc', label: '雾蓝' },
]
export const DEFAULT_ACCENT = ACCENT_COLORS[0].value

/** 色值 → 中文名；认不出就把原值返回，不至于显示空白 */
export function accentLabel(value: string) {
  return ACCENT_COLORS.find((item) => item.value === value)?.label ?? value
}

export function readTheme(): ThemeId {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'deep'
}

export function readAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT
}
