/**
 * 首次进首页时提示「添加到主屏幕」。
 *
 * 只在 iPhone / iPad 的 Safari 里出现：桌面、安卓、以及已经装到主屏幕的独立窗口都不显示
 * （装好之后 `isStandalone()` 为 true，横幅自然消失）。
 *
 * 关掉一次就永远不再出现。这类提示重复弹比不弹更烦人，而用户一旦装好了本来也就看不到了。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { isIosWebApp, isStandalone } from '@/platform/pwa'

const DISMISS_KEY = 'starburst.installHintDismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function InstallHint() {
  const { t } = useI18n()
  const [hidden, setHidden] = useState(() => readDismissed() || !isIosWebApp() || isStandalone())

  if (hidden) return null

  return (
    <div className="mt-8 flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">{t('home.installHint')}</p>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            // 隐私模式存不了：下次进首页还会提示，不影响使用
          }
        }}
        className="shrink-0 rounded-md px-1 text-muted transition-colors hover:text-brand"
      >
        ×
      </button>
    </div>
  )
}
