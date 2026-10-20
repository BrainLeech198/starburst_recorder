/**
 * 覆盖层的登记簿：谁开着、最上面那个怎么关。
 *
 * 安卓实体返回键的口径是「先关弹窗，再回上一级」，所以它得先知道现在有没有覆盖层、
 * 并让最上面那一层关掉。弹窗（Modal）与助手的抽屉在挂载时登记自己——
 * 挂载顺序就是层叠顺序，所以"最后一个登记的"就是最上面那层。
 */

export interface OverlayEntry {
  /** 怎么关掉自己；null 表示这一层关不掉（例如没给 onClose 的弹窗） */
  close: (() => void) | null
}

const stack: OverlayEntry[] = []

export function pushOverlay(close: (() => void) | null): OverlayEntry {
  const entry: OverlayEntry = { close }
  stack.push(entry)
  return entry
}

/** 用登记时拿到的句柄来销号，免得两个 null 互相顶掉 */
export function popOverlay(entry: OverlayEntry) {
  const index = stack.indexOf(entry)
  if (index >= 0) stack.splice(index, 1)
}

/**
 * 关掉最上面那一层。
 * - `'none'`：没有覆盖层，返回键该去管路由了
 * - `'blocked'`：最上面那层关不掉 → 返回键什么都不做（别把它跳过、去动底下的路由）
 * - `'closed'`：关掉了
 */
export function closeTopOverlay(): 'closed' | 'blocked' | 'none' {
  const top = stack[stack.length - 1]
  if (top === undefined) return 'none'
  if (top.close === null) return 'blocked'
  top.close()
  return 'closed'
}
