/**
 * 页头：返回 + 页面名（+ 当前值药丸、右侧一个动作）+ 一句说明。
 *
 * 结构照 Material 3 顶部栏：左边放导航（返回），右边最多一个动作，页面名在下面一行。
 * 返回用全站统一的实心红（BACK_BUTTON）；右侧 action 是给「保存」「批量恢复」这类
 * 页面级动作留的落点，不传就只留返回条。
 *
 * 刻意不吸顶（2026-10-20 定）：设置类二级页都很短，吸顶白占地方；日记编辑页是一整张纸，
 * 吸顶会把纸的顶边切掉。以后哪个长列表页要常驻，别改这里，由那个页面自己包一层吸顶容器。
 *
 * 页内返回不能省：桌面壳没有系统返回键，安卓实体返回键也还没接（ROADMAP 第 7 项），
 * 这是目前唯一的"回上一级"入口。title 可以不传：内容自带标题时（例如 AI 那一块是自带标题的整卡）就只留返回条。
 */
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { BACK_BUTTON } from './buttonStyles'

export default function PageHeader({
  title,
  description,
  badge,
  action,
  backTo = '/me/settings',
  backLabel = '设置',
}: {
  title?: string
  description?: string
  /** 标题右侧的当前值，通常传一个 <SettingBadge> */
  badge?: ReactNode
  /** 右侧的动作位，最多一个（保存 / 批量恢复这类） */
  action?: ReactNode
  /** 返回哪儿：子页回自己的菜单，菜单回「我的」 */
  backTo?: string
  /** 返回链接上的名字，跟上一层同名 */
  backLabel?: string
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {/* 这是唯一的"回上一级"入口，要一眼看出"可以点" */}
        <Link to={backTo} className={`inline-flex items-center ${BACK_BUTTON}`}>
          ← {backLabel}
        </Link>
        {action}
      </div>

      {(title || badge) && (
        <div className="mt-3 flex items-start justify-between gap-3">
          {title && <h1 className="text-lg font-medium">{title}</h1>}
          {badge}
        </div>
      )}

      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </>
  )
}
