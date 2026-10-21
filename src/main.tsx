import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { BallProvider } from './app/providers/BallProvider'
import { ToastProvider } from './app/providers/ToastProvider'
import { I18nProvider } from './shared/i18n/I18nProvider'
import { router } from './app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BallProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </BallProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
