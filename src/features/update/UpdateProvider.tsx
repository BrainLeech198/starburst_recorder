/**
 * 检查更新：启动时静默查一次，有新版就弹窗；「我的」里也留一个手动入口 + 红点。
 *
 * 一天最多烦一次：点「稍后」会把版本记到今天，明天启动才会再弹；
 * 红点不受这个限制，只要还有新版就一直亮着。
 */
import { GHOST_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { APP_VERSION } from '@/core/version'
import { SITE_URL } from '@/core/links'
import { openExternal } from '@/platform/openExternal'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import DownloadProgressPanel from './DownloadProgressPanel'
import { checkForUpdate, downloadUpdate, getDownloadSource, getUpdateChannel, onDownloadProgress, setDownloadSource, setUpdateChannel, shouldPrompt, snooze } from './updateService'
import type { DownloadSource, UpdateChannel, UpdateInfo } from './updateService'

interface UpdateValue {
  /** 有新版时非空，「我的」用它点红点 */
  info: UpdateInfo | null
  checking: boolean
  /** 当前更新通道：正式版 / 测试版 */
  channel: UpdateChannel
  /** 切换通道会清掉旧结果，并按新通道立刻查一次 */
  setChannel: (channel: UpdateChannel) => void
  /** 手动检查：结果会用 toast 说一句 */
  check: () => void
  /** 已经有 info 时重新打开弹窗 */
  open: () => void
  close: () => void
}

const UpdateContext = createContext<UpdateValue | null>(null)

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
  const [channel, setChannelState] = useState<UpdateChannel>(getUpdateChannel)
  /** 本次弹窗里选的下载源；默认 Gitee */
  const [source, setSource] = useState<DownloadSource>(getDownloadSource)
  const started = useRef(false)
  /** 每次检查递增；切通道后，旧请求的结果一律丢掉 */
  const checkSeq = useRef(0)

  /** 每次打开弹窗前从本地设置读一次，「版本」页可能刚改过 */
  const openWithCurrentSource = useCallback(() => {
    setSource(getDownloadSource())
    setOpen(true)
  }, [])

  const runCheck = useCallback(
    async (manual: boolean, nextChannel: UpdateChannel = channel) => {
      const seq = ++checkSeq.current
      setChecking(true)
      const found = await checkForUpdate(locale, nextChannel)
      if (seq !== checkSeq.current) return null
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
    [channel, locale, showToast, t],
  )

  /** 切通道：先清掉旧结果，避免测试版卡片留在正式版通道里 */
  const setChannel = useCallback(
    (next: UpdateChannel) => {
      if (next === channel) return
      setUpdateChannel(next)
      setChannelState(next)
      setInfo(null)
      void runCheck(true, next)
    },
    [channel, runCheck],
  )

  // 启动检查一次；StrictMode 下 effect 会跑两遍，用 ref 挡住
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const found = await runCheck(false)
      if (found && shouldPrompt(found)) openWithCurrentSource()
    })()
  }, [runCheck, openWithCurrentSource])

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
      channel,
      setChannel,
      check: () => {
        if (info) {
          openWithCurrentSource()
          return
        }
        void runCheck(true)
      },
      open: openWithCurrentSource,
      close,
    }),
    [channel, checking, close, info, openWithCurrentSource, runCheck, setChannel],
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
        message: result.finished
          ? t('update.launched')
          : result.path
            ? t('update.saved', { path: result.path })
            : t('update.done'),
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
        <Modal
          size="sm"
          label={
            downloading
              ? t('update.downloadTitle')
              : t('update.title', { version: info.version })
          }
          // 下载中不给关：进度一消失，用户就只能干等；下完或失败会自动收起来
          onClose={downloading ? undefined : close}
        >
          {downloading ? (
            <DownloadProgressPanel fileName={info.fileName} progress={progress} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-medium">
                  {t('update.title', { version: info.version })}
                </h2>
                {info.beta && (
                  <span className="rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                    {t('update.betaBadge')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {t('update.current', { version: APP_VERSION })}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t('update.channelLine', {
                  channel:
                    channel === 'beta' ? t('version.channelBeta') : t('version.channelStable'),
                })}
              </p>
              {info.beta && (
                <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-fg">
                  {t('update.betaNote')}
                </p>
              )}
              {info.notes && (
                <>
                  <p className="mt-4 text-xs font-medium text-muted">{t('update.notes')}</p>
                  <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-fg">
                    {info.notes}
                  </div>
                </>
              )}

              {/* 测试版只放在 GitHub，下载源切换没有意义，直接不显示 */}
              {!info.beta && (
                <div className="mt-4">
                  <p className="m-0 text-xs font-medium text-muted">{t('version.source')}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['gitee', 'github'] as DownloadSource[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={source === item}
                        onClick={() => {
                          setDownloadSource(item)
                          setSource(item)
                        }}
                        className={choiceTile(source === item, 'px-3 py-2 text-xs')}
                      >
                        {t(item === 'gitee' ? 'version.sourceGitee' : 'version.sourceGithub')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void openExternal(info.beta ? info.pageUrl : SITE_URL)}
                  className="text-xs text-muted underline-offset-4 transition-colors hover:text-brand hover:underline"
                >
                  {t(info.beta ? 'update.releasePage' : 'update.site')}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={close} className={GHOST_BUTTON}>
                    {t('update.later')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startDownload()}
                    className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2"
                  >
                    {t('update.download')}
                  </button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </UpdateContext.Provider>
  )
}
