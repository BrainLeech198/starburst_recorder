/** 实心主按钮：全站统一，新增 / 记一笔 / 返回 / 恢复入口都用它 */
export const SOLID_BUTTON =
  'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition-opacity hover:opacity-90'

/** 危险操作按钮：形状尺寸同上，只换成统一的危险色（删除 / 清空） */
export const SOLID_DANGER =
  'rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-on-danger transition-opacity hover:opacity-90'

/** 底部批量工具条上的小按钮 */
export const BAR_BUTTON =
  'rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40'

/** 工具条上的危险小按钮（批量删除这类） */
export const BAR_DANGER =
  'rounded-lg px-2.5 py-1 text-xs text-danger transition-colors hover:opacity-80 disabled:opacity-40'

/** 描边主色按钮：次要但重要的动作（测试连接 / 应用 / 写入日记） */
export const OUTLINE_BUTTON =
  'rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2 disabled:opacity-40'

/**
 * 「点一下就选中」的格子，全站统一写法：厂商、明暗、悬浮球形象/大小、窗口预设都用它。
 * 尺寸和内容排布靠 extra 追加，免得每处各写一套边框和选中态。
 */
export function choiceTile(active: boolean, extra = '') {
  return [
    'rounded-lg border text-sm transition-colors',
    active ? 'border-brand text-brand' : 'border-line text-muted hover:text-fg',
    extra,
  ].join(' ')
}
