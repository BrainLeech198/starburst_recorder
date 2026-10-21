/**
 * i18n 的上下文与取词逻辑。组件只从这里拿 `useI18n`；
 * Provider 单独放在 I18nProvider.tsx，避免 Fast Refresh 警告。
 */
import { createContext, useContext } from 'react'
import { zh } from './messages/zh'
import type { MessageKey } from './messages/zh'

const LOCALE_KEY = 'sb_locale'
const SUPPORTED_LOCALES = ['zh'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]
export type MessageParams = Record<string, string | number>

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh }

export interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: MessageParams) => string
}

export const I18nContext = createContext<I18nValue | null>(null)

export function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    // 隐私模式读不了就按默认语言
  }
  return 'zh'
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // 存不了就只在本次会话生效
  }
}

/** 把文案里的 {name} 换成实际值 */
export function interpolate(template: string, params?: MessageParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n 必须在 I18nProvider 里使用')
  return value
}
