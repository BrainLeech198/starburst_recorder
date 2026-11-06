import { useI18n } from '@/shared/i18n/context'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import type { FoodSortDirection, FoodSortKey } from './foodSort'

export default function FoodSortControls({
  sortKey,
  direction,
  onSortKeyChange,
  onDirectionToggle,
  className = '',
}: {
  sortKey: FoodSortKey
  direction: FoodSortDirection
  onSortKeyChange: (key: FoodSortKey) => void
  onDirectionToggle: () => void
  className?: string
}) {
  const { t } = useI18n()
  const directionLabel = direction === 'asc' ? t('common.orderAscending') : t('common.orderDescending')

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 ${className}`}>
      <select
        value={sortKey}
        onChange={(event) => onSortKeyChange(event.target.value as FoodSortKey)}
        aria-label={t('common.sortBy')}
        className={`${INPUT} min-w-0`}
      >
        <option value="name">{t('common.sortName')}</option>
        <option value="createdAt">{t('common.sortAddedAt')}</option>
      </select>
      <button
        type="button"
        onClick={onDirectionToggle}
        aria-label={directionLabel}
        title={directionLabel}
        className={`${OUTLINE_BUTTON} min-w-24 justify-center`}
      >
        {directionLabel} {direction === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  )
}
