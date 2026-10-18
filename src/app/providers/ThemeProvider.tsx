import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ACCENT_KEY, readAccent, readTheme, THEME_KEY, THEMES } from '../theme'
import type { ThemeId } from '../theme'

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
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
