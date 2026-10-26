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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(readTheme)
  const [accent, setAccent] = useState<string>(readAccent)
  const firstTheme = useRef(true)

  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)

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
