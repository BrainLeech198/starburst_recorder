import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { BallProvider } from './app/providers/BallProvider'
import { ToastProvider } from './app/providers/ToastProvider'
import { UpdateProvider } from './features/update/UpdateProvider'
import { I18nProvider } from './shared/i18n/I18nProvider'
import { router } from './app/router'
import { desktopBridge } from './platform/desktop'
import { notifyChange } from './core/db/changes'
import './index.css'

// 桌面版可能开着「快速记一笔」小窗，那边写库本窗口看不见，靠主进程转发过来
desktopBridge()?.onDbChanged?.(notifyChange)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BallProvider>
          <ToastProvider>
            <UpdateProvider>
              <RouterProvider router={router} />
            </UpdateProvider>
          </ToastProvider>
        </BallProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
