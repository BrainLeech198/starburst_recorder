import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface ToastOptions {
  message: string
  /** 可选的撤销类操作，例如「撤销」 */
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

interface ToastState extends ToastOptions {
  id: number
}

interface ToastValue {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | null>(null)
  const counterRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (options: ToastOptions) => {
      clearTimer()
      counterRef.current += 1
      setToast({ ...options, id: counterRef.current })
      timerRef.current = window.setTimeout(() => {
        setToast(null)
        timerRef.current = null
      }, options.durationMs ?? 6000)
    },
    [clearTimer],
  )

  useEffect(() => clearTimer, [clearTimer])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2">
            <span className="text-sm text-fg">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.()
                  clearTimer()
                  setToast(null)
                }}
                className="text-sm font-medium text-brand"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast 必须在 ToastProvider 内使用')
  return value
}
