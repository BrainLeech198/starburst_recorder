/**
 * 极简 i18n 的语言状态。语言入口在设置 →「语言」，切换后立即生效并写进 localStorage。
 *
 * 用法：
 *   const { t } = useI18n()
 *   t('nav.home')
 *   t('diary.count', { count: 3 })   // 文案里写「共 {count} 篇」
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  I18nContext,
  MESSAGES,
  interpolate,
  readLocale,
  saveLocale,
  setActiveLocale,
} from './context'
import type { I18nValue, Locale } from './context'
import { zh } from './messages/zh'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale)
  setActiveLocale(locale)

  const value = useMemo<I18nValue>(() => {
    function setLocale(next: Locale) {
      setLocaleState(next)
      saveLocale(next)
    }

    return {
      locale,
      setLocale,
      t: (key, params) => interpolate(MESSAGES[locale][key] ?? zh[key], params),
    }
  }, [locale])

  // 让浏览器 / 读屏知道当前语言；简体用 zh-CN，其余按语言代码。
  // 窗口标题也跟语言走，桌面端任务栏和浏览器标签页能看到。
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale
    document.title = MESSAGES[locale]['app.name']
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
