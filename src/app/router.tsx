import { lazy } from 'react'
import { createHashRouter, Navigate } from 'react-router'
import AppShell from './layout/AppShell'
import RouteError from './RouteError'

/**
 * 页面全部走懒加载：首屏只拿首页和壳层，其余页面点开时再下。
 * 配合 AppShell 里的 Suspense，切换页面不会白屏。
 */
const HomePage = lazy(() => import('@/features/home/HomePage'))
const DiaryPage = lazy(() => import('@/features/diary/DiaryPage'))
const DiaryEditPage = lazy(() => import('@/features/diary/DiaryEditPage'))
const TrashPage = lazy(() => import('@/features/diary/TrashPage'))
const PresetsPage = lazy(() => import('@/features/diary/PresetsPage'))
const PresetTrashPage = lazy(() => import('@/features/diary/PresetTrashPage'))
const HealthPage = lazy(() => import('@/features/health/HealthPage'))
const HealthProfilePage = lazy(() => import('@/features/health/ProfilePage'))
const FoodLibraryPage = lazy(() => import('@/features/health/FoodLibraryPage'))
const FoodTrashPage = lazy(() => import('@/features/health/FoodTrashPage'))
const IntakeTrashPage = lazy(() => import('@/features/health/IntakeTrashPage'))
const SleepTrashPage = lazy(() => import('@/features/health/SleepTrashPage'))
const FinancePage = lazy(() => import('@/features/finance/FinancePage'))
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const MePage = lazy(() => import('@/features/me/MePage'))
const VersionPage = lazy(() => import('@/features/me/VersionPage'))
const OlderPage = lazy(() => import('@/features/me/OlderPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const AgentMenuPage = lazy(() => import('@/features/settings/AgentMenuPage'))
const AppearancePage = lazy(() => import('@/features/settings/AppearancePage'))
const LanguagePage = lazy(() => import('@/features/settings/LanguagePage'))
const BallPage = lazy(() => import('@/features/settings/BallPage'))
const AiPage = lazy(() => import('@/features/settings/AiPage'))
const DataPage = lazy(() => import('@/features/settings/DataPage'))
const QuickCapturePage = lazy(() => import('@/features/diary/QuickCapturePage'))

export const router = createHashRouter([
  // 桌面版「快速记一笔」的独立小窗：不套 AppShell，没有导航栏
  { path: '/quick', element: <QuickCapturePage /> },
  {
    path: '/',
    element: <AppShell />,
    // 页面渲染或懒加载分块失败时，至少给一句人话和一个刷新入口
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'diary', element: <DiaryPage /> },
      { path: 'diary/trash', element: <TrashPage /> },
      // 静态段优先于 :code，别把 new 当成一条 7 位编号去查
      { path: 'diary/new', element: <DiaryEditPage /> },
      { path: 'diary/presets', element: <PresetsPage /> },
      { path: 'diary/presets/trash', element: <PresetTrashPage /> },
      { path: 'diary/:code', element: <DiaryEditPage /> },
      { path: 'health', element: <HealthPage /> },
      { path: 'health/profile', element: <HealthProfilePage /> },
      { path: 'health/foods', element: <FoodLibraryPage /> },
      { path: 'health/foods/trash', element: <FoodTrashPage /> },
      { path: 'health/intakes/trash', element: <IntakeTrashPage /> },
      { path: 'health/sleeps/trash', element: <SleepTrashPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'me', element: <MePage /> },
      { path: 'me/version', element: <VersionPage /> },
      { path: 'me/older', element: <OlderPage /> },
      { path: 'me/settings', element: <SettingsPage /> },
      { path: 'me/settings/language', element: <LanguagePage /> },
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
