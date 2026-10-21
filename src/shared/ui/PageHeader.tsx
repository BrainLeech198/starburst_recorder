/**
 * 页头：返回 + 页面名（+ 当前值药丸、右侧页面级动作）+ 一句说明。
 *
 * 结构照 Material 3 顶部栏：左边放导航（返回），右边放本页的整体性动作（新增、测试、批量…），
 * 页面名在下面一行。返回用全站统一的实心红（BACK_BUTTON）。
 *
 * 只要页面有整体性动作，这条「返回 + 动作」的横条就套一层 ToolbarRow（比页面底色亮半档），
 * 让动作区跟下面的内容分开；纯返回的页头不套，免得返回按钮孤零零地坐在一块底色里。
 * 动作可以有多个，窄屏时自动折到下一行，底色仍然包住整块。
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
import ToolbarRow from './ToolbarRow'
import { useI18n } from '../i18n/context'

export default function PageHeader({
  title,
  description,
  badge,
  actions,
  backTo = '/me/settings',
  backLabel,
}: {
  title?: string
  description?: string
  /** 标题右侧的当前值，通常传一个 <SettingBadge> */
  badge?: ReactNode
  /** 本页的整体性动作（保存 / 批量恢复 / 新增 / 测试…）；有动作才套工具条底色 */
  actions?: ReactNode
  /** 返回哪儿：子页回自己的菜单，菜单回「我的」 */
  backTo?: string
  /** 返回链接上的名字，跟上一层同名 */
  backLabel?: string
}) {
  const { t } = useI18n()

  const row = (
    <>
      {/* 这是唯一的"回上一级"入口，要一眼看出"可以点" */}
      <Link to={backTo} className={`inline-flex items-center ${BACK_BUTTON}`}>
        ← {backLabel ?? t('common.settings')}
      </Link>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </>
  )

  return (
    <>
      {actions ? (
        <ToolbarRow className="flex flex-wrap items-center justify-between gap-2">{row}</ToolbarRow>
      ) : (
        <div className="flex items-center justify-between gap-2">{row}</div>
      )}

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
