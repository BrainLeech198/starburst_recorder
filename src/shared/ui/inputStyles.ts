/**
 * 输入框的公共外观，全站一套：边框、底色、字色、聚焦时描边换主题色。
 *
 * 之前每处各写一遍，改一次颜色要动好几个文件；现在只在这里改。
 * 宽度和排版留给调用方（年月输入框窄、表单字段撑满一行），这里只管"长什么样"。
 */

/** 基础外观：只管长相，不含内边距与宽度 */
export const FIELD =
  'rounded-lg border border-line bg-surface-2 text-sm text-fg outline-none focus:border-brand'

/** 表单字段：撑满一行 */
export const INPUT = `w-full px-3 py-2 ${FIELD}`

/** 小号输入框：内边距小一圈，宽度由调用方给（年月、窗口尺寸这类） */
export const INPUT_NARROW = `px-2 py-1 ${FIELD}`

/**
 * 行内数字输入框：固定窄宽、不参与拉伸。
 * 不要用 `${INPUT} w-20` —— INPUT 里带着 w-full，和 w-20 抢宽度时会把同行的名称挤没。
 */
export const INPUT_NUM = `w-20 shrink-0 px-2 py-1.5 text-center ${FIELD}`
