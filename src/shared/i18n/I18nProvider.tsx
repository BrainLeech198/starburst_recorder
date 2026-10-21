/**
 * 极简 i18n 的语言状态。目前只有中文，所以界面上没有切换入口；
 * 等真的加了第二种语言，在设置页挂一个选择器、调用 setLocale 即可。
 *
 * 用法：
 *   const { t } = useI18n()
 *   t('nav.home')
 *   t('diary.count', { count: 3 })   // 文案里写「共 {count} 篇」
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  I18nContext,
  MESSAGES,
  interpolate,
  readLocale,
  saveLocale,
} from './context'
import type { I18nValue, Locale } from './context'
import { zh } from './messages/zh'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale)

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

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
