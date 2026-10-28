/**
 * i18n 的上下文与取词逻辑。组件只从这里拿 `useI18n`；
 * Provider 单独放在 I18nProvider.tsx，避免 Fast Refresh 警告。
 */
import { createContext, useContext } from 'react'
import { zh } from './messages/zh'
import type { MessageKey } from './messages/zh'
import { en } from './messages/en'
import { zhTW } from './messages/zhTW'
import { ja } from './messages/ja'
import { ko } from './messages/ko'
import { de } from './messages/de'
import { fr } from './messages/fr'
import { ru } from './messages/ru'
import { es } from './messages/es'

const LOCALE_KEY = 'sb_locale'

/** 语言页里的展示顺序：简体、繁体、英文，然后是其它语言 */
export const LOCALE_ORDER = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'es'] as const

export type Locale = (typeof LOCALE_ORDER)[number]
export type MessageParams = Record<string, string | number>

/** 每种语言在语言页里的自称（用该语言自己写，便于跨语言辨认） */
export const LOCALE_LABEL_KEYS: Record<Locale, MessageKey> = {
  zh: 'language.zh',
  'zh-TW': 'language.zhTW',
  en: 'language.en',
  ja: 'language.ja',
  ko: 'language.ko',
  de: 'language.de',
  fr: 'language.fr',
  ru: 'language.ru',
  es: 'language.es',
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  zh,
  'zh-TW': zhTW,
  en,
  ja,
  ko,
  de,
  fr,
  ru,
  es,
}

export interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: MessageParams) => string
}

/**
 * 非组件代码（服务层、纯函数）用的取词入口。
 * 组件里仍然走 useI18n；Provider 切换语言时把当前语言同步到这里。
 */
let activeLocale: Locale = 'zh'

export function setActiveLocale(locale: Locale) {
  activeLocale = locale
}

export function translate(key: MessageKey, params?: MessageParams): string {
  return interpolate(MESSAGES[activeLocale][key] ?? zh[key], params)
}

export const I18nContext = createContext<I18nValue | null>(null)

export function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved && (LOCALE_ORDER as readonly string[]).includes(saved)) return saved as Locale
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
