import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export type MascotShape = 'star4' | 'star8' | 'dot' | 'ring'
export type MascotSize = 'sm' | 'md' | 'lg'

export interface BallPrefs {
  shape: MascotShape
  size: MascotSize
}

export const MASCOT_SHAPES: { id: MascotShape; labelKey: MessageKey }[] = [
  { id: 'star4', labelKey: 'ball.shape.star4' },
  { id: 'star8', labelKey: 'ball.shape.star8' },
  { id: 'dot', labelKey: 'ball.shape.dot' },
  { id: 'ring', labelKey: 'ball.shape.ring' },
]

export const MASCOT_SIZE_PX: Record<MascotSize, number> = { sm: 52, md: 64, lg: 80 }

export const MASCOT_SIZES: { id: MascotSize; labelKey: MessageKey }[] = [
  { id: 'sm', labelKey: 'ball.size.sm' },
  { id: 'md', labelKey: 'ball.size.md' },
  { id: 'lg', labelKey: 'ball.size.lg' },
]

const DEFAULT_PREFS: BallPrefs = { shape: 'star8', size: 'md' }
const PREFS_KEY = 'starburst.ball'

function readPrefs(): BallPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<BallPrefs>
    return { shape: parsed.shape ?? DEFAULT_PREFS.shape, size: parsed.size ?? DEFAULT_PREFS.size }
  } catch {
    return DEFAULT_PREFS
  }
}

interface BallValue {
  prefs: BallPrefs
  setPrefs: (patch: Partial<BallPrefs>) => void
}

const BallContext = createContext<BallValue | null>(null)

export function BallProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<BallPrefs>(readPrefs)

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  const setPrefs = (patch: Partial<BallPrefs>) => setState((prev) => ({ ...prev, ...patch }))

  return <BallContext.Provider value={{ prefs, setPrefs }}>{children}</BallContext.Provider>
}

export function useBall() {
  const value = useContext(BallContext)
  if (!value) throw new Error('useBall 必须在 BallProvider 内使用')
  return value
}
