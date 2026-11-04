/**
 * 顶栏按钮的下拉菜单：点按钮在下方浮出小菜单，点别处或 Esc 关闭。
 * 全站第一个下拉组件，目前给日记编辑页的「文件」「插入」「工具」用。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'

export interface DropdownItem {
  label: string
  onSelect: () => void
  /** 需要靠图标区分含义时给一个，纯文字菜单项不用给 */
  icon?: IconName
  danger?: boolean
  disabled?: boolean
  title?: string
}

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40'

export default function Dropdown({
  label,
  items,
  buttonClassName,
  caret = true,
  menuLabel,
}: {
  label: string
  items: DropdownItem[]
  buttonClassName: string
  /** 标签后面是否跟一个 ▾；图标按钮（⋯）不需要 */
  caret?: boolean
  /** 给读屏用的名字：按钮上只有图标时传 */
  menuLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeIndexRef = useRef(-1)
  const openingFocus = useRef<'first' | 'last'>('first')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const focusMenuItem = useCallback(
    (position: 'first' | 'last' | 'next' | 'previous') => {
      const allItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      )
      const enabledItems = allItems.filter((item) => !item.disabled)
      if (enabledItems.length === 0) return

      const current = enabledItems.indexOf(document.activeElement as HTMLButtonElement)
      let next: HTMLButtonElement
      if (position === 'first') next = enabledItems[0]
      else if (position === 'last') next = enabledItems[enabledItems.length - 1]
      else {
        const fallback = enabledItems.findIndex(
          (item) => allItems[activeIndexRef.current] === item,
        )
        const from = current >= 0 ? current : fallback
        const delta = position === 'next' ? 1 : -1
        const index =
          from < 0
            ? position === 'next'
              ? 0
              : enabledItems.length - 1
            : (from + delta + enabledItems.length) % enabledItems.length
        next = enabledItems[index]
      }

      const index = allItems.indexOf(next)
      activeIndexRef.current = index
      setActiveIndex(index)
      next.focus()
    },
    [],
  )

  /*
   * 菜单夹在视口里再显示。
   *
   * 手机上顶栏会换行，「插入」可能落在第二行左边；原来写死 right-0 只是右边缘对齐按钮，
   * 128px 宽的菜单会从屏幕左边伸出去。这里打开时按按钮和菜单的实际尺寸算一次：
   * 默认右对齐，左边不够就贴边；下方放不下就翻到按钮上方。
   * useLayoutEffect 在绘制前同步执行，用户看不到中间位置。
   */
  useLayoutEffect(() => {
    if (!open) return
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    const place = () => {
      const button = root.getBoundingClientRect()
      const box = menu.getBoundingClientRect()
      const margin = 8
      const gap = 4
      let left = button.right - box.width
      left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))
      let top = button.bottom + gap
      if (top + box.height > window.innerHeight - margin) {
        const above = button.top - box.height - gap
        top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin)
      }
      menu.style.left = `${Math.round(left - button.left)}px`
      menu.style.top = `${Math.round(top - button.top)}px`
      menu.style.right = 'auto'
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // 打开后将焦点放到菜单项；方向键从触发按钮打开时可选择首项或末项。
  useLayoutEffect(() => {
    if (!open) return
    focusMenuItem(openingFocus.current)
    openingFocus.current = 'first'
  }, [focusMenuItem, open])

  // 点菜单外任意处关闭
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => {
          if (open) setOpen(false)
          else {
            openingFocus.current = 'first'
            setOpen(true)
          }
        }}
        onKeyDown={(event) => {
          if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
          event.preventDefault()
          openingFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
          setOpen(true)
        }}
        className={buttonClassName}
      >
        {label}
        {caret && ' ▾'}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              focusMenuItem(event.key === 'ArrowDown' ? 'next' : 'previous')
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              focusMenuItem(event.key === 'Home' ? 'first' : 'last')
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
          }}
          className="absolute top-0 left-0 z-40 min-w-32 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              tabIndex={activeIndex === index ? 0 : -1}
              title={item.title}
              onFocus={() => {
                activeIndexRef.current = index
                setActiveIndex(index)
              }}
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
                item.onSelect()
              }}
              className={`${MENU_ITEM} ${
                item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-2'
              }`}
            >
              {item.icon && <Icon name={item.icon} className="mr-0 h-4 w-4 shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
