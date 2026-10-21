/**
 * 带下拉列表的输入框：既能点开看全部选项，也能直接手填。
 *
 * 为什么不用 <input list> + <datalist>：datalist 本质是「自动补全」，
 * 输入框里已经有值时它只显示能匹配当前值的选项——模型名一预填，下拉就只剩那一个，
 * 看起来像「只拉到一条」。而且各浏览器行为不一致，点了也不一定展开。
 * 这里自己画一个列表：点开永远显示全部，打字才过滤。
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface ComboOption {
  value: string
  /** 选项右侧的灰色小字，比如「内置」「用过」 */
  hint?: string
}

export default function ComboBox({
  value,
  options,
  onChange,
  onSelect,
  placeholder,
  inputClassName = '',
  emptyHint = '没有可选项，直接输入也行',
  ariaLabel,
}: {
  value: string
  options: ComboOption[]
  /** 手填时逐字回调 */
  onChange: (text: string) => void
  /** 从列表里选中一项 */
  onSelect: (option: ComboOption) => void
  placeholder?: string
  /** 输入框外观，通常传 shared/ui/inputStyles 的 INPUT */
  inputClassName?: string
  emptyHint?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  /** 打开后用户是否已经开始打字；null 表示「还没打」，这时显示全部 */
  const [typed, setTyped] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const query = typed?.trim().toLowerCase() ?? ''
  const filtered =
    query === ''
      ? options
      : options.filter((option) => option.value.toLowerCase().includes(query))

  // 点外面就收起
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function show() {
    setOpen(true)
    setTyped(null)
    setActive(-1)
  }

  function choose(option: ComboOption) {
    setTyped(null)
    setOpen(false)
    onSelect(option)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) show()
      else setActive((index) => Math.min(index + 1, filtered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter' && open && active >= 0 && filtered[active]) {
      event.preventDefault()
      choose(filtered[active])
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          setTyped(event.target.value)
          setActive(-1)
          setOpen(true)
          onChange(event.target.value)
        }}
        onFocus={show}
        onKeyDown={onKeyDown}
        className={`${inputClassName} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? '收起列表' : '展开列表'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) setOpen(false)
          else {
            show()
            inputRef.current?.focus()
          }
        }}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-fg"
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2 4.5 6 8l4-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">{emptyHint}</p>
          ) : (
            filtered.map((option, index) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    index === active ? 'bg-surface-2' : ''
                  } ${selected ? 'text-brand' : 'text-fg'}`}
                >
                  <span className="min-w-0 flex-1 truncate" title={option.value}>
                    {option.value}
                  </span>
                  {option.hint && (
                    <span className="shrink-0 text-xs text-muted">{option.hint}</span>
                  )}
                  {selected && <span className="shrink-0 text-xs text-brand">✓</span>}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
