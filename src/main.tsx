import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { CareModeProvider } from './shared/care/CareModeProvider'
import { BallProvider } from './app/providers/BallProvider'
import { ToastProvider } from './app/providers/ToastProvider'
import { UpdateProvider } from './features/update/UpdateProvider'
import { I18nProvider } from './shared/i18n/I18nProvider'
import { router } from './app/router'
import { desktopBridge } from './platform/desktop'
import { notifyChange } from './core/db/changes'
import { APP_VERSION } from './core/version'
import { isAndroid } from './features/update/updateService'
import { logInfo } from './shared/log/log'
import './index.css'

// 桌面版可能开着「快速记一笔」小窗，那边写库本窗口看不见，靠主进程转发过来
desktopBridge()?.onDbChanged?.(notifyChange)

// 会话第一条日志：版本与运行平台；出问题时先看这行对不对
logInfo('App', 'app.boot', {
  version: APP_VERSION,
  platform: desktopBridge()?.isDesktop ? 'desktop' : isAndroid() ? 'android' : 'web',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <CareModeProvider>
          <BallProvider>
            <ToastProvider>
              <UpdateProvider>
                <RouterProvider router={router} />
              </UpdateProvider>
            </ToastProvider>
          </BallProvider>
        </CareModeProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
