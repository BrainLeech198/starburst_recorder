import { NavLink, Outlet } from 'react-router'
import FloatingAssistant from '../../features/assistant/FloatingAssistant'

const TABS = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/diary', label: '日记', icon: '📖', end: false },
  { to: '/health', label: '健康', icon: '💪', end: false },
  { to: '/finance', label: '经济', icon: '💰', end: false },
  { to: '/me', label: '我的', icon: '👤', end: false },
]

export default function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg md:flex-row">
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-nav pb-[env(safe-area-inset-bottom)] md:static md:h-dvh md:w-56 md:flex-col md:border-t-0 md:border-r md:pb-0">
        <div className="hidden border-b-2 border-brand bg-nav-strong px-5 py-6 text-base font-medium tracking-wide md:block">
          星芒记录者
        </div>

        <div className="flex flex-1 md:flex-none md:flex-col md:divide-y md:divide-line">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors',
                  'md:flex-none md:flex-row md:justify-start md:gap-2 md:px-5 md:py-3 md:text-sm',
                  isActive ? 'font-medium text-brand' : 'text-muted hover:text-fg',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-base leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <FloatingAssistant />
    </div>
  )
}
