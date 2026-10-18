import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { BallProvider } from './app/providers/BallProvider'
import { ToastProvider } from './app/providers/ToastProvider'
import { router } from './app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BallProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </BallProvider>
    </ThemeProvider>
  </StrictMode>,
)
