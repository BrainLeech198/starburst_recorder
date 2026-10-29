/**
 * 长辈关怀的上下文与 hook。Provider 单独放在 CareModeProvider.tsx，避免 Fast Refresh 警告
 * （和 shared/i18n 的 context.ts / I18nProvider.tsx 同一个拆法）。
 */
import { createContext, useContext } from 'react'
import type { CareState, FontScaleId } from './careMode'

export interface CareValue {
  state: CareState
  setFontScale: (fontScale: FontScaleId) => void
  /** 改总开关或四个子开关 */
  patch: (partial: Partial<CareState>) => void
}

export const CareContext = createContext<CareValue | null>(null)

export function useCareMode() {
  const value = useContext(CareContext)
  if (!value) throw new Error('useCareMode 必须在 CareModeProvider 内使用')
  return value
}
