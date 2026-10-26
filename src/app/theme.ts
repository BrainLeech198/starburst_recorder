import type { MessageKey } from '@/shared/i18n/messages/zh'

/** 主题模式：深色 / 暖深色 / 纯黑 / 自然绿 / 深海 / 三种亮色。主题色（accent）与模式互相独立 */
export type ThemeId =
  | 'deep'
  | 'dusk'
  | 'night'
  | 'forest'
  | 'tide'
  | 'paper'
  | 'mist'
  | 'light'
  | 'blossom'

/**
 * 主题模式。swatch 是给「主题」页画缩略图用的三个代表色（底 / 卡片 / 点缀），
 * 只是示意，实际色值由 index.css 里的 color-mix 跟着主题色派生。
 */
export const THEMES: {
  id: ThemeId
  labelKey: MessageKey
  mark: string
  swatch: [string, string, string]
}[] = [
  { id: 'deep', labelKey: 'theme.deep', mark: '🌌', swatch: ['#0a0d12', '#161b26', '#6ee7ff'] },
  { id: 'dusk', labelKey: 'theme.dusk', mark: '🌇', swatch: ['#171008', '#2a1c10', '#f0a978'] },
  { id: 'night', labelKey: 'theme.night', mark: '🌙', swatch: ['#000000', '#0c0c0f', '#7cc4ff'] },
  { id: 'forest', labelKey: 'theme.forest', mark: '🌿', swatch: ['#07110b', '#122019', '#86efac'] },
  { id: 'tide', labelKey: 'theme.tide', mark: '🌊', swatch: ['#04121b', '#0c2230', '#7dd3fc'] },
  { id: 'light', labelKey: 'theme.light', mark: '☀️', swatch: ['#e7ebf1', '#ffffff', '#0891b2'] },
  { id: 'paper', labelKey: 'theme.paper', mark: '📜', swatch: ['#efe6d6', '#fbf6ec', '#c08a4a'] },
  { id: 'mist', labelKey: 'theme.mist', mark: '🌫️', swatch: ['#e8eef4', '#f8fbfd', '#5b8fd6'] },
  { id: 'blossom', labelKey: 'theme.blossom', mark: '🌸', swatch: ['#f3e6ee', '#fffafc', '#ec4899'] },
]

/** 亮底主题：切主题色时白字/深字的取舍要跟着变 */
export const LIGHT_THEMES: ThemeId[] = ['light', 'paper', 'mist', 'blossom']

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

/** 主题标记（emoji）：光看两个字不容易一眼分清 */
export function themeMark(id: ThemeId): string {
  return THEMES.find((item) => item.id === id)?.mark ?? '●'
}

/** 存过什么就用什么；认不出来（旧版本、手改过）退回深空 */
export function readTheme(): ThemeId {
  const raw = localStorage.getItem(THEME_KEY)
  return THEMES.some((item) => item.id === raw) ? (raw as ThemeId) : 'deep'
}

export function readAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT
}
