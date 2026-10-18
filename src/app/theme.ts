export type ThemeId = 'deep' | 'light'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'deep', label: '深空' },
  { id: 'light', label: '浅色' },
]

export const THEME_KEY = 'starburst.theme'
export const ACCENT_KEY = 'starburst.accent'

// 主题色色板（同时决定强调色、导航背景和悬浮球颜色）
export const ACCENT_COLORS = ['#6ee7ff', '#7dd3a0', '#f0abfc', '#fca5a5', '#fcd34d', '#a5b4fc']
export const DEFAULT_ACCENT = ACCENT_COLORS[0]

export function readTheme(): ThemeId {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'deep'
}

export function readAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT
}
