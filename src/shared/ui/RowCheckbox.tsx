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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={label}
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
        checked ? 'border-brand bg-brand text-on-brand' : 'border-line text-transparent'
      }`}
    >
      <span aria-hidden="true">✓</span>
    </button>
  )
}
