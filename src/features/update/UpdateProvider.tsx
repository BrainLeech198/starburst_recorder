/**
 * 检查更新：启动时静默查一次，有新版就弹窗；「我的」里也留一个手动入口 + 红点。
 *
 * 一天最多烦一次：点「稍后」会把版本记到今天，明天启动才会再弹；
 * 红点不受这个限制，只要还有新版就一直亮着。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { APP_VERSION } from '@/core/version'
import { SITE_URL } from '@/core/links'
import { openExternal } from '@/platform/openExternal'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { checkForUpdate, downloadUpdate, onDownloadProgress, shouldPrompt, snooze } from './updateService'
import type { UpdateInfo } from './updateService'

interface UpdateValue {
  /** 有新版时非空，「我的」用它点红点 */
  info: UpdateInfo | null
  checking: boolean
  /** 手动检查：结果会用 toast 说一句 */
  check: () => void
  /** 已经有 info 时重新打开弹窗 */
  open: () => void
  close: () => void
}

const UpdateContext = createContext<UpdateValue | null>(null)

/** 进度条上显示的 MB 数，保留一位小数 */
function formatMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1)
}

export function useUpdate() {
  const value = useContext(UpdateContext)
  if (!value) throw new Error('useUpdate 必须在 UpdateProvider 里使用')
  return value
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null)
  const started = useRef(false)

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (checking) return
      setChecking(true)
      const found = await checkForUpdate(locale)
      setChecking(false)
      if (found) setInfo(found)
      if (manual) {
        showToast({
          message: found
            ? t('update.found', { version: found.version })
            : t('update.latest', { version: APP_VERSION }),
        })
      }
      return found
    },
    [checking, locale, showToast, t],
  )

  // 启动检查一次；StrictMode 下 effect 会跑两遍，用 ref 挡住
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const found = await runCheck(false)
      if (found && shouldPrompt(found)) setOpen(true)
    })()
  }, [runCheck])

  const close = useCallback(() => {
    setOpen(false)
    setInfo((current) => {
      if (current) snooze(current.version)
      return current
    })
  }, [])

  const value = useMemo<UpdateValue>(
    () => ({
      info,
      checking,
      check: () => {
        if (info) {
          setOpen(true)
          return
        }
        void runCheck(true)
      },
      open: () => setOpen(true),
      close,
    }),
    [checking, close, info, runCheck],
  )

  async function startDownload() {
    if (!info || downloading) return
    setDownloading(true)
    setProgress({ received: 0, total: 0 })
    const unsubscribe = onDownloadProgress((next) => setProgress(next))
    let result
    try {
      result = await downloadUpdate(info)
    } finally {
      unsubscribe()
      setProgress(null)
      setDownloading(false)
    }
    if (result.ok) {
      showToast({
        message: result.path ? t('update.saved', { path: result.path }) : t('update.done'),
      })
      setOpen(false)
      return
    }
    showToast({ message: t('update.failed', { error: result.error ?? 'unknown' }) })
  }

  return (
    <UpdateContext.Provider value={value}>
      {children}
      {open && info && (
        <Modal size="sm" label={t('update.title', { version: info.version })} onClose={close}>
          <h2 className="text-base font-medium">{t('update.title', { version: info.version })}</h2>
          <p className="mt-1 text-xs text-muted">
            {t('update.current', { version: APP_VERSION })}
          </p>
          {info.notes && (
            <>
              <p className="mt-4 text-xs font-medium text-muted">{t('update.notes')}</p>
              <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-fg">
                {info.notes}
              </div>
            </>
          )}
          {downloading && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {t('update.downloading', { name: info.fileName })}
                </span>
                <span className="tabular-nums">
                  {progress && progress.total > 0
                    ? t('update.downloadProgress', {
                        received: formatMb(progress.received),
                        total: formatMb(progress.total),
                      })
                    : t('update.downloadWaiting')}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-300"
                  style={{
                    width:
                      progress && progress.total > 0
                        ? `${Math.min(100, Math.round((progress.received / progress.total) * 100))}%`
                        : '15%',
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void openExternal(SITE_URL)}
              className="text-xs text-muted underline-offset-4 transition-colors hover:text-brand hover:underline"
            >
              {t('update.site')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
              >
                {t('update.later')}
              </button>
              <button
                type="button"
                onClick={() => void startDownload()}
                disabled={downloading}
                className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {downloading
                  ? t('update.downloading', { name: info.fileName })
                  : t('update.download')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </UpdateContext.Provider>
  )
}
