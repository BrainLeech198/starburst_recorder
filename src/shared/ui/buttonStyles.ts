/** 实心主按钮：全站统一，新增 / 记一笔 / 保存 / 恢复入口都用它（返回不用它，见 BACK_BUTTON） */
export const SOLID_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition-opacity hover:opacity-90 md:min-h-0'

/** 危险操作按钮：形状尺寸同上，只换成统一的危险色（删除 / 清空 / 彻底删除） */
export const SOLID_DANGER =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-on-danger transition-opacity hover:opacity-90 md:min-h-0'

/** 可恢复的危险操作（例如整块放进回收站）：黄色实心，和红色「永久删除」区分开 */
export const SOLID_WARN =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-warning px-3 py-1.5 text-sm font-medium text-ink transition-opacity hover:opacity-90 md:min-h-0'

/**
 * 「返回上一级」按钮：实心危险色红 + 反色文字。
 *
 * 它长得和 SOLID_DANGER 一样，这是 2026-10-20 在预览页里对比四种形态后用户明确选定的效果，
 * 不是顺手复用；单独留个名字是因为：红在本应用里原本只表示「危险操作」，
 * 返回是借用了这个颜色，将来要给返回换色（或给危险操作换色）只改这一处。
 * 副作用要心里有数：和「删除」同框时两个红块会长得一样（例如日记编辑页的头部）。
 */
export const BACK_BUTTON = SOLID_DANGER

/** 底部批量工具条上的小按钮：手机上同样按 44px 触控高度，桌面保持紧凑 */
export const BAR_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40 md:min-h-0'

/** 工具条上的危险小按钮（批量删除这类） */
export const BAR_DANGER =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 py-1 text-xs text-danger transition-colors hover:opacity-80 disabled:opacity-40 md:min-h-0'

/** 描边主色按钮：次要但重要的动作（测试连接 / 应用 / 写入日记） */
export const OUTLINE_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors hover:bg-surface-2 disabled:opacity-40 md:min-h-0'

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
