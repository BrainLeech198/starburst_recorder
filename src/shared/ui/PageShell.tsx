/**
 * 页面外壳 = Page + PageHeader 的常用组合，设置/助手这 6 个页面都用它。
 *
 * 2026-10-20 拆开：容器（Page）与页头（PageHeader）各自独立，
 * 页面结构不一样时可以自己拼（例如整张纸铺满的日记编辑页只用页头那一套返回样式，
 * 不带这个居中容器）；这层壳留着，是为了让"就是最普通的一页"的调用点保持一行。
 */
import type { ReactNode } from 'react'
import Page from './Page'
import PageHeader from './PageHeader'

export default function PageShell({
  title,
  description,
  badge,
  actions,
  backTo,
  backLabel,
  children,
}: {
  title?: string
  description?: string
  /** 标题右侧的当前值，通常传一个 <SettingBadge> */
  badge?: ReactNode
  /** 本页的整体性动作（保存 / 批量恢复 / 新增 / 测试…），放在返回按钮同一行的工具条里 */
  actions?: ReactNode
  /** 返回哪儿：子页回自己的菜单，菜单回「我的」；默认见 PageHeader */
  backTo?: string
  /** 返回链接上的名字，跟上一层同名；默认见 PageHeader */
  backLabel?: string
  children: ReactNode
}) {
  return (
    <Page>
      <PageHeader
        title={title}
        description={description}
        badge={badge}
        actions={actions}
        backTo={backTo}
        backLabel={backLabel}
      />
      <div className="mt-6 space-y-4">{children}</div>
    </Page>
  )
}
