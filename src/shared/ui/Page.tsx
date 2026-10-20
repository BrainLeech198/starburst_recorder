/**
 * 页容器：一屏宽、水平居中、统一页内边距。
 *
 * 只管"页面这块地方有多宽、离屏幕边多远"，不管页头长什么样——
 * 设置/助手那几页都是这个尺寸；日记编辑页那种整张纸铺满的页面，不用它。
 */
import type { ReactNode } from 'react'

export default function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md p-4">{children}</div>
}
