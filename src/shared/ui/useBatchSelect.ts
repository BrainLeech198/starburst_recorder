import { useEffect, useState } from 'react'
import { popOverlay, pushOverlay } from './overlayStack'

/**
 * 批量多选的状态机：日记、随记、回收站、AI 模型列表四处共用。
 *
 * 只负责「进没进批量模式、选中了谁」，具体动作（删除 / 恢复 / 移动 / 启用）
 * 由页面自己接。这样各处多选的交互和按钮文案能保持一致，
 * 不用每个页面再各写一套 toggle / 全选 / 反选。
 */
export interface BatchSelect {
  /** 是否处于批量模式 */
  active: boolean
  selected: string[]
  count: number
  enter: () => void
  /** 退出批量并清空选中 */
  exit: () => void
  toggle: (id: string) => void
  isSelected: (id: string) => boolean
  /** 全选：传当前列表里所有可选 id */
  setAll: (ids: string[]) => void
  /** 反选：传当前列表里所有可选 id */
  invert: (ids: string[]) => void
  clear: () => void
}

export function useBatchSelect(): BatchSelect {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  // 批量模式登记成一「层」：安卓实体返回键的口径是「先关最上面那层」，
  // 所以按返回应该先退出批量，而不是直接离开页面、把选中全丢掉
  useEffect(() => {
    if (!active) return
    const entry = pushOverlay(() => {
      setActive(false)
      setSelected([])
    })
    return () => popOverlay(entry)
  }, [active])

  return {
    active,
    selected,
    count: selected.length,
    enter: () => setActive(true),
    exit: () => {
      setActive(false)
      setSelected([])
    },
    toggle: (id) =>
      setSelected((ids) =>
        ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
      ),
    isSelected: (id) => selected.includes(id),
    setAll: (ids) => setSelected([...ids]),
    invert: (ids) => setSelected((current) => ids.filter((id) => !current.includes(id))),
    clear: () => setSelected([]),
  }
}
