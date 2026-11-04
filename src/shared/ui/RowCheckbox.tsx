import { useState } from 'react'

/**
 * 列表行的多选勾选框：全站一个样子。
 *
 * 之前有圆、有角标、有方三种，同一件事在不同页长得不一样；
 * 收到一处，圆圈 + 勾，选中填主题色，未选中只留描边。
 */
export default function RowCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean
  /** 给读屏用的名字，通常是这一行的名称 */
  label: string
  onToggle: () => void
}) {
  const [drawCheckmark, setDrawCheckmark] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        setDrawCheckmark(!checked)
        onToggle()
      }}
      aria-pressed={checked}
      aria-label={label}
      className={`sb-pressable mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border active:scale-90 ${
        checked ? 'border-brand bg-brand text-on-brand' : 'border-line text-transparent'
      }`}
    >
      {checked && (
        <svg aria-hidden="true" viewBox="0 0 14 12" className="h-3.5 w-3.5 overflow-visible">
          <path
            d="M1 6.5 5 10 13 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="20"
            strokeDashoffset={drawCheckmark ? 20 : 0}
            className={drawCheckmark ? 'sb-checkmark-draw' : undefined}
            onAnimationEnd={() => setDrawCheckmark(false)}
          />
        </svg>
      )}
    </button>
  )
}
