/**
 * 长辈关怀状态的 Provider：内存态 + localStorage 持久化 + 挂到 <html> 上。
 * 和 ThemeProvider 一个套路——状态变就写一次存储、刷一次根节点属性。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { applyCareState, CARE_KEY, parseCareState } from './careMode'
import type { CareState } from './careMode'
import { CareContext } from './careContext'

export function CareModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CareState>(() => parseCareState(localStorage.getItem(CARE_KEY)))

  useEffect(() => {
    applyCareState(state)
    localStorage.setItem(CARE_KEY, JSON.stringify(state))
  }, [state])

  return (
    <CareContext.Provider
      value={{
        state,
        setFontScale: (fontScale) => setState((prev) => ({ ...prev, fontScale })),
        patch: (partial) => setState((prev) => ({ ...prev, ...partial })),
      }}
    >
      {children}
    </CareContext.Provider>
  )
}
