import { createHashRouter } from 'react-router'
import AppShell from './layout/AppShell'
import HomePage from '../features/home/HomePage'
import DiaryPage from '../features/diary/DiaryPage'
import DiaryEditPage from '../features/diary/DiaryEditPage'
import TrashPage from '../features/diary/TrashPage'
import HealthPage from '../features/health/HealthPage'
import FinancePage from '../features/finance/FinancePage'
import AssistantPage from '../features/assistant/AssistantPage'
import CalendarPage from '../features/calendar/CalendarPage'
import MePage from '../features/me/MePage'
import SettingsPage from '../features/settings/SettingsPage'

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
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
