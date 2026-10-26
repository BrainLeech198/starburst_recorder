/**
 * 顶栏按钮的下拉菜单：点按钮在下方浮出小菜单，点别处或 Esc 关闭。
 * 全站第一个下拉组件，目前给日记编辑页的「文件」「插入」「工具」用。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface DropdownItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  title?: string
}

const MENU_ITEM =
  'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40'

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
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // 点菜单外任意处关闭
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {label}
        {caret && ' ▾'}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute top-0 left-0 z-40 min-w-32 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`${MENU_ITEM} ${
                item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-2'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
