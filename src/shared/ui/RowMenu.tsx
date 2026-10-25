import Dropdown from './Dropdown'
import type { DropdownItem } from './Dropdown'

/**
 * 列表行尾的「⋯」菜单。
 * 操作一多，四个文字按钮会把名称和营养挤没；收进一个图标按钮，点开再选。
 */
export default function RowMenu({ label, items }: { label: string; items: DropdownItem[] }) {
  return (
    <Dropdown
      label="⋯"
      menuLabel={label}
      caret={false}
      items={items}
      buttonClassName="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    />
  )
}
