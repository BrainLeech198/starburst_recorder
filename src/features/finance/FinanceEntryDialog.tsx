/**
 * 记一笔 / 改一笔。
 *
 * 快捷优先：金额、收支方向、分类是必填，名称和备注都可以空着——
 * 名称留空时用分类名兜底，列表里不会出现一行空白。
 */
import { useState } from 'react'
import type { FinanceEntry, FinanceKind } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { isDateKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { categoriesOf, categoryKey } from './financeCategories'
import { roundMoney } from './financeMath'
import { addFinance, saveFinance } from './financeRepo'

export default function FinanceEntryDialog({
  entry = null,
  defaultDate,
  onClose,
  onSaved,
}: {
  /** 传了就是编辑，没传就是新增 */
  entry?: FinanceEntry | null
  /** 新增时的默认日期，通常是今天或当前查看月份的 1 号 */
  defaultDate: string
  onClose: () => void
  onSaved: (record: FinanceEntry) => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [kind, setKind] = useState<FinanceKind>(entry?.kind ?? 'expense')
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '')
  const [category, setCategory] = useState(entry?.category ?? categoriesOf('expense')[0].id)
  const [name, setName] = useState(entry?.name ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [dateKey, setDateKey] = useState(entry?.dateKey ?? defaultDate)
  const [error, setError] = useState('')

  const amount = Number(amountText.replace(/,/g, ''))
  const valid =
    amountText.trim() !== '' && Number.isFinite(amount) && amount > 0 && isDateKey(dateKey)

  /** 换方向时分类列表整组换掉，别把「工资」留在支出里 */
  function switchKind(next: FinanceKind) {
    if (next === kind) return
    setKind(next)
    setCategory(categoriesOf(next)[0].id)
  }

  async function submit() {
    if (!valid) {
      setError(t('finance.invalidAmount'))
      return
    }
    const trimmed = name.trim()
    const displayName = trimmed === '' ? t(categoryKey(category)) : trimmed
    const record: FinanceEntry = entry
      ? {
          ...entry,
          dateKey,
          kind,
          category,
          name: displayName,
          amount: roundMoney(amount),
          note: note.trim(),
        }
      : {
          id: newId(),
          code: newCode(),
          dateKey,
          kind,
          category,
          name: displayName,
          amount: roundMoney(amount),
          note: note.trim(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        }
    if (entry) await saveFinance(record)
    else await addFinance(record)
    showToast({ message: t(entry ? 'finance.updated' : 'finance.saved') })
    onSaved(record)
    onClose()
  }

  return (
    <Modal size="sm" label={t(entry ? 'finance.editTitle' : 'finance.addTitle')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">
        {t(entry ? 'finance.editTitle' : 'finance.addTitle')}
      </h2>

      {/* 收支方向：两个并排的格子，选中态跟全站 choiceTile 一致 */}
      <div className="mt-4 flex gap-2">
        {(['expense', 'income'] as FinanceKind[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={kind === item}
            onClick={() => switchKind(item)}
            className={choiceTile(kind === item, 'flex-1 py-2 text-sm')}
          >
            {t(item === 'expense' ? 'finance.expense' : 'finance.income')}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-muted">{t('finance.amount')}</span>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-lg text-muted">{t('finance.currency')}</span>
          <input
            autoFocus
            value={amountText}
            onChange={(event) => {
              setAmountText(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label={t('finance.amount')}
            className={`${INPUT} w-full text-2xl tabular-nums`}
          />
        </div>
      </label>

      <div className="mt-3">
        <span className="text-xs text-muted">{t('finance.category')}</span>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {categoriesOf(kind).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className={choiceTile(category === item.id, 'px-1 py-2 text-center text-xs')}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">{t('finance.name')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('finance.namePlaceholder')}
            className={`${INPUT} mt-1 w-full`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">{t('finance.date')}</span>
          <input
            type="date"
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
            className={`${INPUT} mt-1 w-full tabular-nums`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-muted">{t('finance.note')}</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${INPUT} mt-1 w-full`}
        />
      </label>

      {error !== '' && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => void submit()}
          className={`${SOLID_BUTTON} disabled:opacity-40`}
        >
          {t('finance.save')}
        </button>
      </div>
    </Modal>
  )
}
