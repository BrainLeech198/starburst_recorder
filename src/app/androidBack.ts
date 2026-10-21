/**
 * 安卓实体返回键：口径 + 接线。
 *
 * 口径（2026-10-21 定）：**先关弹窗 → 再回上一级 → 到了首页再按一次退出**。
 * 「再按一次」给 2 秒的窗口，提示条也用同一个时长，说完就收（复用全局提示条）。
 *
 * 只在 Capacitor 的安卓壳里接管：注册了 `backButton` 监听就等于把系统的默认行为
 * （能回退就回退 WebView 历史、否则退出应用）整个接过来，所以这里必须把三种情况都兜住。
 * 浏览器与桌面端没有实体返回键，这套完全不生效。
 *
 * 为什么把 createBackHandler 从 hook 里单拎出来：它不碰 Capacitor、不碰 React，
 * 口径改完能在 dev 控制台里直接跑一遍（构造一份假上下文、连按两次看返回值），
 * 不必为了试一下就去装模拟器。
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useToast } from '@/app/providers/ToastProvider'
import { closeTopOverlay } from '@/shared/ui/overlayStack'

/** 连按两次退出的时间窗（毫秒） */
export const EXIT_WINDOW_MS = 2000

/** 按一次返回键之后的去向，也是这套口径的"返回值"，方便单独验证 */
export type BackResult =
  'closed-overlay' | 'blocked' | 'went-back' | 'went-home' | 'ask-exit' | 'exit'

export interface BackContext {
  /** 关掉最上面那层覆盖层（弹窗 / 助手抽屉） */
  closeTopOverlay: () => 'closed' | 'blocked' | 'none'
  /** 现在是不是在首页 */
  atHome: () => boolean
  /** 还有没有上一级可回 */
  canGoBack: () => boolean
  /** 回上一级 */
  goBack: () => void
  /** 回首页：直接打开某一页（深链）时没有上一级，拿它当兜底 */
  goHome: () => void
  /** 退出应用 */
  exit: () => void
  /** 提示一句 */
  notify: (message: string) => void
}

export function createBackHandler(ctx: BackContext, now: () => number = Date.now) {
  // null = "还没按过"。别拿 0 当哨兵：换个从 0 起跑的时钟（假计时器、单调时钟）
  // 第一次按就会被算成"刚按过"，直接退出应用
  let lastAskAt: number | null = null

  return function handleBack(): BackResult {
    const overlay = ctx.closeTopOverlay()
    if (overlay === 'closed') return 'closed-overlay'
    if (overlay === 'blocked') return 'blocked'

    if (!ctx.atHome()) {
      if (ctx.canGoBack()) {
        ctx.goBack()
        return 'went-back'
      }
      ctx.goHome()
      return 'went-home'
    }

    const stamp = now()
    if (lastAskAt !== null && stamp - lastAskAt <= EXIT_WINDOW_MS) {
      ctx.exit()
      return 'exit'
    }
    lastAskAt = stamp
    ctx.notify('再按一次返回，退出星芒记录者')
    return 'ask-exit'
  }
}

/** 是不是跑在 Capacitor 的安卓壳里（浏览器 / 桌面端都不是） */
function inAndroidShell() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function useAndroidBackButton() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { showToast } = useToast()

  // 监听只挂一次，当前的页面路径靠 ref 读——不然每跳一次页面都要重新注册监听
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  })

  useEffect(() => {
    if (!inAndroidShell()) return

    const handleBack = createBackHandler({
      closeTopOverlay,
      atHome: () => pathnameRef.current === '/',
      // WebView 里历史长度 ≥2 就说明有上一级；直接打开某一页时长度为 1，那就回首页兜底
      canGoBack: () => window.history.length > 1,
      goBack: () => void navigate(-1),
      goHome: () => void navigate('/'),
      exit: () => void App.exitApp(),
      notify: (message) => showToast({ message, durationMs: EXIT_WINDOW_MS }),
    })

    const listener = App.addListener('backButton', handleBack)
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [navigate, showToast])
}
