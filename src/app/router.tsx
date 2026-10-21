import { createHashRouter, Navigate } from 'react-router'
import AppShell from './layout/AppShell'
import HomePage from '@/features/home/HomePage'
import DiaryPage from '@/features/diary/DiaryPage'
import DiaryEditPage from '@/features/diary/DiaryEditPage'
import TrashPage from '@/features/diary/TrashPage'
import HealthPage from '@/features/health/HealthPage'
import FinancePage from '@/features/finance/FinancePage'
import AssistantPage from '@/features/assistant/AssistantPage'
import CalendarPage from '@/features/calendar/CalendarPage'
import MePage from '@/features/me/MePage'
import SettingsPage from '@/features/settings/SettingsPage'
import AgentMenuPage from '@/features/settings/AgentMenuPage'
import AppearancePage from '@/features/settings/AppearancePage'
import BallPage from '@/features/settings/BallPage'
import AiPage from '@/features/settings/AiPage'
import DataPage from '@/features/settings/DataPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'diary', element: <DiaryPage /> },
      { path: 'diary/trash', element: <TrashPage /> },
      { path: 'diary/:code', element: <DiaryEditPage /> },
      { path: 'health', element: <HealthPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'me', element: <MePage /> },
      { path: 'me/settings', element: <SettingsPage /> },
      { path: 'me/settings/theme', element: <AppearancePage /> },
      { path: 'me/settings/data', element: <DataPage /> },
      { path: 'me/agent', element: <AgentMenuPage /> },
      { path: 'me/agent/ball', element: <BallPage /> },
      { path: 'me/agent/ai', element: <AiPage /> },
      // 设置页曾经在一级（/settings），老书签留个跳转，免得打开是一片空白
      { path: 'settings/*', element: <Navigate to="/me/settings" replace /> },
    ],
  },
])
