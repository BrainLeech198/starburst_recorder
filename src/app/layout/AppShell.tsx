import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router'
import FloatingAssistant from '@/features/assistant/FloatingAssistant'
import ScheduleReminderHost from '@/features/schedule/ScheduleReminderHost'
import PushReminderHost from '@/features/notifications/PushReminderHost'
import NoticePopup from '@/features/notices/NoticePopup'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useAndroidBackButton } from '@/app/androidBack'
import { ballVisible } from '@/app/debugFlags'
import { nextRecordNavAction } from './recordNav'

/** 「记录」这一组：日记 / 健康 / 经济。它们在导航里不再各自占一格，收进「记录」下面 */
const RECORDS: { to: string; labelKey: MessageKey; icon: string }[] = [
  { to: '/diary', labelKey: 'nav.diary', icon: '📖' },
  { to: '/health', labelKey: 'nav.health', icon: '💪' },
  { to: '/finance', labelKey: 'nav.finance', icon: '💰' },
]

/** 导航图标：悬停轻抬、按下回弹，当前页由 CSS 再点亮一点（见 index.css 的 .nav-icon） */
const NAV_ICON =
  'sb-pressable nav-icon text-base leading-none transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-90'

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
 * 导航是「首页 / 记录 / 日历 / 我的」四格。「记录」按钮按日记 → 健康 → 经济 → 收起 → 日历的顺序前进。
 * 「记录」那一组里装着日记、健康、经济——
 * 桌面侧栏能真嵌套（缩进挂在「记录」下面），手机底栏没法竖着嵌，
 * 所以手机上点「记录」是在底栏**上方**展开一行（三个子项横排）。
 */
export default function AppShell() {
  // 安卓实体返回键（浏览器 / 桌面端不生效）：先关弹窗 → 再回上一级 → 首页再按一次退出
  useAndroidBackButton()
  const { t } = useI18n()
  const navigate = useNavigate()

  const contentRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const { pathname, search } = useLocation()
  const section = pathname.split('/')[1] ?? ''
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
  function advanceRecords() {
    const action = nextRecordNavAction(pathname, recordsOpen)
    if (action.type === 'collapse') {
      setManualOpen(false)
      return
    }
    navigate(action.to)
  }

  // 滚动容器不再是文档，浏览器不会替我们复位，得自己管：
  //   · 换页（pathname 变了）回到顶部；只改查询参数（翻日期、切筛选）不动，免得输入时跳来跳去
  //   · 后退 / 前进（POP）把原来那一页的位置还回去——从列表第 30 条点进去，返回后还被扔回顶部
  //     等于白翻，这也是「真栈返回」必须配套的一半（见 shared/ui/backNav.ts）
  // 位置靠滚动事件持续记：等路由变了再读 scrollTop，读到的已经是新页面被夹到 0 之后的值了。
  // 记忆的键是「路径 + 查询串」而不是 location.key：返回（POP）时 react-router 给这条历史
  // 生成的是新的 key，拿 key 去查必然查不到——第一版就栽在这儿，位置永远还原成 0。
  const scrollMemory = useRef(new Map<string, number>())
  const lastPathname = useRef(pathname)
  const scrollKey = pathname + search
  // 滚动监听只挂一次，当前是哪一页靠 ref 读
  const scrollKeyRef = useRef(scrollKey)
  const navigationType = useNavigationType()

  useEffect(() => {
    scrollKeyRef.current = scrollKey
  }, [scrollKey])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const remember = () => {
      scrollMemory.current.set(scrollKeyRef.current, el.scrollTop)
    }
    el.addEventListener('scroll', remember, { passive: true })
    return () => el.removeEventListener('scroll', remember)
  }, [])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const changedPage = lastPathname.current !== pathname
    lastPathname.current = pathname

    if (navigationType === 'POP') {
      const saved = scrollMemory.current.get(scrollKey) ?? 0
      if (saved <= 0) return
      // 数据（liveQuery）和懒加载的分块都还没落地时，内容不够高，设 scrollTop 会被夹到 0。
      // 逐帧重试，直到真的落到目标位置；最多试 20 帧（约 0.3 秒）就放弃，别一直占着 rAF。
      let tries = 0
      let raf = 0
      const apply = () => {
        el.scrollTop = saved
        if (Math.abs(el.scrollTop - saved) > 1 && tries < 20) {
          tries += 1
          raf = requestAnimationFrame(apply)
        }
      }
      raf = requestAnimationFrame(apply)
      return () => cancelAnimationFrame(raf)
    }

    if (changedPage) el.scrollTop = 0
  }, [scrollKey, pathname, navigationType])

  // 安卓软键盘：聚焦输入框时系统会把整个 WebView 顶上来，收起键盘后并不会替我们复位，
  // 于是整页停在上抬的位置。这里记住最大可视高度，等高度恢复（键盘收起）再把文档滚动清零。
  // 放在壳层里，全站所有输入框都走这一道，不用每个弹窗各修一遍。
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let maxHeight = viewport.height
    let timer = 0
    const reset = () => {
      maxHeight = Math.max(maxHeight, viewport.height)
      // 键盘还开着（可视高度明显小于最大值）时不动，免得把正在输入的框顶出去
      if (viewport.height < maxHeight - 80) return
      window.scrollTo(0, 0)
      document.scrollingElement?.scrollTo(0, 0)
    }
    const scheduleReset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(reset, 250)
    }
    viewport.addEventListener('resize', scheduleReset)
    window.addEventListener('resize', scheduleReset)
    // 失焦后键盘收起的动画还要走一会儿，等它落定再判断
    window.addEventListener('focusout', scheduleReset)
    return () => {
      window.clearTimeout(timer)
      viewport.removeEventListener('resize', scheduleReset)
      window.removeEventListener('resize', scheduleReset)
      window.removeEventListener('focusout', scheduleReset)
    }
  }, [])

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
            onClick={advanceRecords}
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

          <NavLink to="/search" className={({ isActive }) => itemClass(isActive)}>
            <span aria-hidden="true" className={NAV_ICON}>
              🔍
            </span>
            {t('nav.search')}
          </NavLink>
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
      {/* 悬浮球平时常驻；完整助手页里它已经多余，还会压住输入区，就不显示 */}
      {ballVisible() && pathname !== '/assistant' && <FloatingAssistant />}
      <NoticePopup />
      <ScheduleReminderHost />
      <PushReminderHost />
    </div>
  )
}
