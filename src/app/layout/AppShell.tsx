import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import FloatingAssistant from '@/features/assistant/FloatingAssistant'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useAndroidBackButton } from '@/app/androidBack'
import { ballVisible } from '@/app/debugFlags'

/** 「记录」这一组：日记 / 健康 / 经济。它们在导航里不再各自占一格，收进「记录」下面 */
const RECORDS: { to: string; labelKey: MessageKey; icon: string }[] = [
  { to: '/diary', labelKey: 'nav.diary', icon: '📖' },
  { to: '/health', labelKey: 'nav.health', icon: '💪' },
  { to: '/finance', labelKey: 'nav.finance', icon: '💰' },
]

/** 导航图标：悬停轻抬、按下回弹，当前页由 CSS 再点亮一点（见 index.css 的 .nav-icon） */
const NAV_ICON =
  'nav-icon text-base leading-none transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-90'

/**
 * 「记录」下面的三项。
 * variant = 'bar'：手机底栏展开的那一行，横排、图标在上（跟底栏其他项一致）
 * variant = 'list'：桌面侧栏里缩进的一列
 */
function RecordLinks({ variant }: { variant: 'bar' | 'list' }) {
  const { t } = useI18n()
  return (
    <>
      {RECORDS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            [
              'group',
              variant === 'bar'
                ? 'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs'
                : 'flex items-center gap-2 py-2 pl-9 pr-5 text-xs',
              'transition-colors',
              isActive ? 'font-medium text-brand' : 'text-muted hover:text-fg',
            ].join(' ')
          }
        >
          <span aria-hidden="true" className={NAV_ICON}>
            {item.icon}
          </span>
          {t(item.labelKey)}
        </NavLink>
      ))}
    </>
  )
}

/** 导航项的统一写法（手机上图标在上、桌面端图标在左） */
function itemClass(active: boolean) {
  return [
    'group flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors',
    'md:flex-none md:flex-row md:justify-start md:gap-2 md:px-5 md:py-3 md:text-sm',
    active ? 'font-medium text-brand' : 'text-muted hover:text-fg',
  ].join(' ')
}

/**
 * 壳层：固定一屏高，**只有内容区自己滚**（`main` 是唯一的滚动容器）。
 *
 * 导航是「首页 / 记录（可展开） / 日历 / 我的」四格。「记录」那一组里装着日记、健康、经济——
 * 桌面侧栏能真嵌套（缩进挂在「记录」下面），手机底栏没法竖着嵌，
 * 所以手机上点「记录」是在底栏**上方**展开一行（三个子项横排）。
 */
export default function AppShell() {
  // 安卓实体返回键（浏览器 / 桌面端不生效）：先关弹窗 → 再回上一级 → 首页再按一次退出
  useAndroidBackButton()
  const { t } = useI18n()

  const contentRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const section = pathname.split('/')[1] ?? ''
  const lastSection = useRef(section)
  const inRecords = RECORDS.some((item) => pathname.startsWith(item.to))
  // 「记录」开着没：默认跟着路由走（人在记录下就开着）；用户手动拨过一下，就以手动为准——
  // 但只在本板块内作数。点了记录以外的栏目（板块变了），手动状态清零，展开跟着收起来。
  // 板块切换在渲染期间复位（React 官方的 adjust-state-during-render），不进 effect，
  // 免得被 react-hooks/set-state-in-effect 拦。
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const [prevSection, setPrevSection] = useState(section)
  if (prevSection !== section) {
    setPrevSection(section)
    setManualOpen(null)
  }
  const recordsOpen = manualOpen ?? inRecords

  // 滚动容器不再是文档，浏览器不会替我们复位。规则：
  // 换板块（设置页 → 日记）回到顶部；同一板块内进出（列表 → 某一篇 → 返回）保留位置。
  useEffect(() => {
    if (lastSection.current === section) return
    lastSection.current = section
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [section])

  // 手机上底栏高度会随「记录」展开而变化。批量工具条按 --sb-nav-h 把自己抬到底栏上方，
  // 不必在 BatchBar 里写死一个「大概够高」的 bottom；桌面侧栏不参与，置 0。
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => {
      const mobile = window.matchMedia('(max-width: 767px)').matches
      document.documentElement.style.setProperty(
        '--sb-nav-h',
        mobile ? `${nav.getBoundingClientRect().height}px` : '0px',
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(nav)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--sb-nav-h')
    }
  }, [])

  return (
    <div className="sb-shell relative flex flex-col bg-bg pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-fg md:flex-row">
      {/* 氛围层：两团随时间缓慢漂移的径向光晕，跟着主题色走（见 index.css 的 .sb-ambient）。
          pointer-events-none 且压在内容下面，只负责「有气」不抢交互 */}
      <div className="sb-ambient" aria-hidden="true" />
      {/* 上面三个内边距是给刘海/状态栏让位的：
          现在（API 34 及以下）系统已经把 WebView 摆在状态栏下面，inset 是 0，等于没生效；
          Android 15 起强制边到边，这里就变成真正把内容往下推的那一道。
          底部留给底栏自己处理（见下面 nav 的 pb），所以这里不重复加。 */}
      <nav
        ref={navRef}
        className="relative z-10 order-last flex shrink-0 flex-col border-t border-line bg-nav pb-[env(safe-area-inset-bottom)] md:order-first md:w-56 md:border-t-0 md:border-r md:pb-0"
      >
        <div className="hidden border-b-2 border-brand bg-nav-strong px-5 py-6 text-base font-medium tracking-wide md:block">
          {t('app.name')}
        </div>

        {/* 手机：展开的子菜单占底栏上方的一行 */}
        {recordsOpen && (
          <div className="flex border-b border-line md:hidden">
            <RecordLinks variant="bar" />
          </div>
        )}

        <div className="flex flex-1 md:flex-none md:flex-col md:divide-y md:divide-line">
          <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
            <span aria-hidden="true" className={NAV_ICON}>
              🏠
            </span>
            {t('nav.home')}
          </NavLink>

          {/* 不用 ▾ 箭头：展开与否靠颜色说——开着就是主题色文字 + 一层淡主题色底。
              展开的子项本身也在旁边/上方，点一下就有反应，认得出来 */}
          <button
            type="button"
            onClick={() => setManualOpen(!recordsOpen)}
            aria-expanded={recordsOpen}
            className={[itemClass(inRecords || recordsOpen), recordsOpen ? 'bg-brand/15' : ''].join(
              ' ',
            )}
          >
            <span aria-hidden="true" className={NAV_ICON}>
              📝
            </span>
            {t('nav.records')}
          </button>

          {/* 桌面：展开的子项缩进挂在「记录」下面 */}
          {recordsOpen && (
            <div className="hidden md:flex md:flex-col md:divide-y md:divide-line">
              <RecordLinks variant="list" />
            </div>
          )}

          <NavLink to="/calendar" className={({ isActive }) => itemClass(isActive)}>
            <span aria-hidden="true" className={NAV_ICON}>
              📅
            </span>
            {t('nav.calendar')}
          </NavLink>
          <NavLink to="/me" className={({ isActive }) => itemClass(isActive)}>
            <span aria-hidden="true" className={NAV_ICON}>
              👤
            </span>
            {t('nav.me')}
          </NavLink>
        </div>
      </nav>

      {/* sb-scroll：弹窗打开时锁的就是它（见 useScrollLock）；overscroll-contain 防滚动链 */}
      <main
        ref={contentRef}
        className="sb-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* 页面按路由懒加载，切换时先显示一句「加载中」，避免白屏 */}
        <Suspense fallback={<div className="p-4 text-sm text-muted">{t('common.loading')}</div>}>
          {/* key=pathname：换页时整层重挂一次，播一遍入场动画（同板块内进出也算换页）。
              flex + min-h-full 让页面至少铺满可视区：首页靠它做真正的垂直居中，
              内容比一屏长的页面照样按内容长高、由 main 滚动 */}
          <div key={pathname} className="sb-page flex min-h-full flex-col">
            <Outlet />
          </div>
        </Suspense>
      </main>
      {/* 悬浮球平时不显示（它还是个占位，点开只会说 AI 没接），调试开关见 debugFlags.ts */}
      {ballVisible() && <FloatingAssistant />}
    </div>
  )
}
