/**
 * 套餐成分的折叠列表。
 *
 * 记一笔时的一行和健康首页的一行都要「一行看合计、点开看成分」，
 * 折叠状态是纯展示，所以放在这个小件里，两处共用一套样式。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { formatNum } from './healthMath'

export interface MealPart {
  name: string
  grams: number
  kcal: number
  protein: number
}

export default function MealParts({ label, parts }: { label: string; parts: MealPart[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  if (parts.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-xs text-muted transition-colors hover:text-brand"
      >
        {label}
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="m-0 mt-1 list-none space-y-0.5 border-l border-line pl-2">
          {parts.map((part, index) => (
            <li key={`${part.name}-${index}`} className="text-xs text-muted">
              <span className="text-fg">{part.name}</span>
              {' · '}
              {t('intake.itemMeta', {
                grams: formatNum(part.grams),
                kcal: formatNum(part.kcal),
                protein: formatNum(part.protein),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
