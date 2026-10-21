import type { ReactNode } from 'react'
import { useI18n } from '@/shared/i18n/context'
import BatchBar from './BatchBar'
import { BAR_BUTTON } from './buttonStyles'
import type { BatchSelect } from './useBatchSelect'

/**
 * 批量模式底部工具条的通用版：全选 / 反选 / 取消 + 页面自己的动作 + 完成。
 *
 * 日记、随记、回收站、AI 模型列表都套这一层，保证四个地方的批量操作长得一样、
 * 顺序也一样；中间那段（删除、恢复、启用…）由调用方以 children 传进来。
 */
export default function BatchActions({
  select,
  ids,
  unit,
  children,
}: {
  select: BatchSelect
  /** 当前列表里所有可选中的 id */
  ids: string[]
  /** 量词：条 / 笔 / 个 */
  unit: string
  /** 这个列表自己的批量动作 */
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <BatchBar count={select.count} unit={unit}>
      <button type="button" onClick={() => select.setAll(ids)} className={BAR_BUTTON}>
        {t('common.selectAll')}
      </button>
      <button type="button" onClick={() => select.invert(ids)} className={BAR_BUTTON}>
        {t('common.invert')}
      </button>
      <button type="button" onClick={select.clear} className={BAR_BUTTON}>
        {t('common.cancel')}
      </button>
      {children}
      <button type="button" onClick={select.exit} className={`${BAR_BUTTON} text-brand`}>
        {t('common.done')}
      </button>
    </BatchBar>
  )
}
