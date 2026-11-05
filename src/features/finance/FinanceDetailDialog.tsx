/**
 * 一笔收支的查看弹窗。
 *
 * 列表里单击一行先来这里：分类、日期时刻、±金额（收入绿 / 支出红）、票据照片、备注；
 * 改金额去编辑，走底部按钮，和摄入详情弹窗同一套动线。
 */
import type { FinanceEntry } from '@/core/db/schema'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import PhotoPreview from '@/shared/ui/PhotoPreview'
import TimeMeta from '@/shared/ui/TimeMeta'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { formatDate } from '@/core/utils/dateKey'
import { categoryKey } from './financeCategories'

export default function FinanceDetailDialog({
  entry,
  money,
  onClose,
  onEdit,
}: {
  entry: FinanceEntry
  /** 页面算好的金额格式（带币种与千分位），弹窗只管上色 */
  money: (value: number) => string
  onClose: () => void
  onEdit: () => void
}) {
  const { t } = useI18n()
  const isIncome = entry.kind === 'income'

  return (
    <Modal size="sm" label={entry.name} onClose={onClose}>
      <div className="min-w-0">
        <p className="m-0 flex items-baseline gap-2 text-base font-medium text-fg">
          <span className="truncate">{entry.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted">{entry.code}</span>
        </p>
        <p className="m-0 mt-1 text-xs text-muted">
          <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px]">
            {t(categoryKey(entry.category))}
          </span>{' '}
          {formatDate(entry.dateKey, t)} {entry.time} ·{' '}
          {t(isIncome ? 'finance.income' : 'finance.expense')}
        </p>
      </div>

      <p
        className={`m-0 mt-4 text-3xl font-medium tabular-nums ${
          isIncome ? 'text-success' : 'text-danger'
        }`}
      >
        {isIncome ? '+' : '-'}
        {money(entry.amount)}
      </p>

      <TimeMeta createdAt={entry.createdAt} updatedAt={entry.updatedAt} />

      {entry.photo && (
        <PhotoPreview
          src={entry.photo}
          alt={t('finance.photo')}
          className="max-h-60 w-full rounded-xl border border-line"
          wrapperClassName="mt-4 w-full"
        />
      )}

      {entry.note !== '' && (
        <p className="m-0 mt-4 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-muted">
          {entry.note}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onEdit} className={SOLID_BUTTON}>
          <Icon name="edit" />
          {t('finance.editEntry')}
        </button>
        <button type="button" onClick={onClose} className={OUTLINE_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
