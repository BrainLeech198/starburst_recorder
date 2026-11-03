import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ACCENT_KEY, readAccent, readTheme, THEME_KEY, THEMES } from '@/app/theme'
import type { ThemeId } from '@/app/theme'

interface ThemeValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  themes: typeof THEMES
  accent: string
  setAccent: (accent: string) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

/**
 * 把算出来的颜色统一成 `#rrggbb`。
 *
 * 现代浏览器对 color-mix 的返回值是 `color(srgb 0.07 0.11 0.14)` 这种 Color 4 写法，
 * 老一点的 Android WebView 解析不了 `<meta name="theme-color">` 里的它，会直接忽略、
 * 退回 manifest 里写死的深色——那正是这个函数要避免的结果。
 */
function toHex(color: string): string | null {
  const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  const parts = srgb ?? rgb
  if (!parts) return null
  const channels = [parts[1], parts[2], parts[3]].map((value) => {
    // color(srgb …) 是 0–1 的小数，rgb() 是 0–255
    const scaled = srgb ? Number(value) * 255 : Number(value)
    return Math.round(Math.min(255, Math.max(0, scaled)))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

/**
 * 把 `<meta name="theme-color">` 跟着主题换掉。
 *
 * 安卓 Chrome 与桌面浏览器用它给地址栏 / 状态栏上色；写死在 index.html 里的话，
 * 浅色主题下顶上会挂一条深色，看着像没渲染完。装到主屏幕的 PWA 也读它。
 *
 * `--color-bg` 多数主题是 `color-mix()` 表达式，不能直接塞进 meta——让浏览器算一次，
 * 再把 `backgroundColor` 读回来。
 */
function syncThemeColor() {
  const probe = document.createElement('span')
  probe.style.cssText =
    'position:absolute;width:0;height:0;visibility:hidden;background:var(--color-bg)'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).backgroundColor
  probe.remove()
  if (!computed) return

  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', toHex(computed) ?? computed)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(readTheme)
  const [accent, setAccent] = useState<string>(readAccent)
  const firstTheme = useRef(true)

  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    // 换主题时先同步状态栏配色，再决定要不要加过渡：过渡期间读到的是中间色
    syncThemeColor()

    // 首次进入（含 StrictMode 的第二次执行）不该「淡入」，只给后来手动切换加过渡
    if (firstTheme.current || previous === theme) {
      firstTheme.current = false
      return
    }
    root.classList.add('sb-theme-fading')
    const timer = window.setTimeout(() => root.classList.remove('sb-theme-fading'), 320)
    return () => {
      window.clearTimeout(timer)
      root.classList.remove('sb-theme-fading')
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--sb-accent', accent)
    localStorage.setItem(ACCENT_KEY, accent)
    // 强调色会混进 --color-bg（见 index.css 的 color-mix），背景变了状态栏也得跟着变
    syncThemeColor()
  }, [accent])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return value
}
