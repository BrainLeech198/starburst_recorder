/** 页内栏目切换：日记页和回收站页共用 */
export default function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'whitespace-nowrap border-b-2 border-brand px-2 py-1 text-sm text-brand'
          : 'whitespace-nowrap border-b-2 border-transparent px-2 py-1 text-sm text-muted transition-colors hover:text-fg'
      }
    >
      {children}
    </button>
  )
}
