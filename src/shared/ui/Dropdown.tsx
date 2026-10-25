/**
 * 顶栏按钮的下拉菜单：点按钮在下方浮出小菜单，点别处或 Esc 关闭。
 * 全站第一个下拉组件，目前给日记编辑页的「文件」「插入」「工具」用。
 */
import { useEffect, useRef, useState } from 'react'

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
}: {
  label: string
  items: DropdownItem[]
  buttonClassName: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {label} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-32 rounded-xl border border-line bg-surface p-1 shadow-lg"
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
