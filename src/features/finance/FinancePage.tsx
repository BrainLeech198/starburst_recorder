/**
 * 经济首页 = 月账本。
 *
 * 一屏之内按「结余 → 记一笔 → 按天流水」排：
 *   - 月份进 URL，翻月和刷新都停在同一页
 *   - 顶部结余卡同时给出收入 / 支出，右侧就是记一笔
 *   - 流水按天折成一节，日头和收尾都带小计，长月份也好扫
 *
 * 分类先用内置的那批，数据层只存分类 id；预算、账户、定期账单留到后面再加。
 */
import EmptyState from '@/shared/ui/EmptyState'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FinanceEntry } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatMonthDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import {
  groupFinanceByDay,
  isMonthKey,
  monthKeyOf,
  shiftMonth,
  summarizeFinance,
} from './financeMath'
import { categoryKey } from './financeCategories'
import { financeOfMonth, removeFinance, restoreFinance } from './financeRepo'
import FinanceEntryDialog from './FinanceEntryDialog'

/** 日头用星期几：JS 的 0=周日，正好对上 date.weekdayShortN */
function weekdayKey(dateKey: string): MessageKey {
  const day = new Date(dateKey + 'T00:00:00').getDay()
  return ('date.weekdayShort' + day) as MessageKey
}

export default function FinancePage() {
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentMonth = monthKeyOf(todayKey())
  const monthParam = searchParams.get('month')
  const monthKey = isMonthKey(monthParam) ? monthParam : currentMonth
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const previousMonth = shiftMonth(currentMonth, -1)
  const relativeMonthKey: MessageKey | null =
    monthKey === currentMonth
      ? 'finance.thisMonth'
      : monthKey === previousMonth
        ? 'finance.lastMonth'
        : null
  const lastDay = new Date(year, month, 0).getDate()
  const monthRange = t('finance.monthRange', {
    from: formatMonthDay(`${monthKey}-01`, t),
    to: formatMonthDay(`${monthKey}-${String(lastDay).padStart(2, '0')}`, t),
  })

  const entries = useLiveQuery(() => financeOfMonth(monthKey), [monthKey])
  const rows = entries ?? []
  const summary = summarizeFinance(rows)
  const days = groupFinanceByDay(rows)

  /** 新增 / 编辑；date 是新增时预填的日期 */
  const [dialog, setDialog] = useState<{ entry: FinanceEntry | null; date: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FinanceEntry | null>(null)

  function money(value: number) {
    return `${t('finance.currency')}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value)}`
  }

  function setMonth(next: string) {
    setSearchParams({ month: next }, { replace: true })
  }

  /** 看的是哪个月就往哪个月记；不在本月时默认落在 1 号 */
  function defaultDate() {
    return monthKey === currentMonth ? todayKey() : `${monthKey}-01`
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    await removeFinance(target.id)
    showToast({
      message: t('finance.deleted'),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreFinance(target.id)
      },
    })
  }

  return (
    <div className="w-full p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-lg font-medium text-fg">{t('nav.finance')}</h1>
        {monthKey !== currentMonth && (
          <button
            type="button"
            onClick={() => setMonth(currentMonth)}
            className="text-xs text-brand transition-opacity hover:opacity-80"
          >
            {t('finance.currentMonth')}
          </button>
        )}
      </header>

      {/* 月份翻页：标题居中，左右各一个箭头 */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-2 py-1">
        <button
          type="button"
          aria-label={t('finance.prevMonth')}
          onClick={() => setMonth(shiftMonth(monthKey, -1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-brand"
        >
          ‹
        </button>
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
          {relativeMonthKey && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                relativeMonthKey === 'finance.thisMonth'
                  ? 'bg-success/15 text-success'
                  : 'bg-warning/15 text-warning'
              }`}
            >
              {t(relativeMonthKey)}
            </span>
          )}
          <span className="text-sm font-medium tabular-nums text-fg">
            {t('finance.monthTitle', { year, month })}
          </span>
          <span className="hidden shrink-0 text-xs tabular-nums text-muted min-[360px]:inline">
            {monthRange}
          </span>
        </span>
        <button
          type="button"
          aria-label={t('finance.nextMonth')}
          onClick={() => setMonth(shiftMonth(monthKey, 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-brand"
        >
          ›
        </button>
      </div>

      {/* 结余卡：大数字 + 收支两栏，右上角直接记一笔 */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] text-muted">{t('finance.balance')}</p>
            <p
              className={`m-0 mt-1 text-3xl font-medium tabular-nums ${
                summary.balance < 0 ? 'text-danger' : 'text-fg'
              }`}
            >
              {money(summary.balance)}
            </p>
            <p className="m-0 mt-1 text-[11px] text-muted">
              {t('finance.entryCount', { n: rows.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ entry: null, date: defaultDate() })}
            className={`${SOLID_BUTTON} shrink-0`}
          >
            {t('finance.add')}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] text-muted">{t('finance.income')}</p>
            <p className="m-0 mt-0.5 truncate text-sm tabular-nums text-brand">
              +{money(summary.income)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="m-0 text-[11px] text-muted">{t('finance.expense')}</p>
            <p className="m-0 mt-0.5 truncate text-sm tabular-nums text-fg">
              -{money(summary.expense)}
            </p>
          </div>
        </div>
      </section>

      {entries === undefined ? null : days.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="🧾" text={t('finance.empty')} />
        </div>
      ) : (
        days.map((day) => (
          <section
            key={day.dateKey}
            className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <header className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2">
              <span className="min-w-0 truncate text-xs text-fg">
                {formatMonthDay(day.dateKey, t)} · {t(weekdayKey(day.dateKey))}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {t('finance.dayExpense', { value: money(day.summary.expense) })}
              </span>
            </header>
            <ul className="m-0 list-none p-0">
              {day.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 border-t border-line px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setDialog({ entry, date: entry.dateKey })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">
                      {t(categoryKey(entry.category))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{entry.name}</span>
                      {entry.note !== '' && (
                        <span className="block truncate text-[11px] text-muted">{entry.note}</span>
                      )}
                    </span>
                  </button>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      entry.kind === 'income' ? 'text-brand' : 'text-fg'
                    }`}
                  >
                    {entry.kind === 'income' ? '+' : '-'}
                    {money(entry.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(entry)}
                    aria-label={t('common.delete')}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {dialog && (
        <FinanceEntryDialog
          entry={dialog.entry}
          defaultDate={dialog.date}
          onClose={() => setDialog(null)}
          onSaved={(record) => {
            // 记到别的月份时直接翻过去，不然刚记的一笔会“消失”
            const savedMonth = monthKeyOf(record.dateKey)
            if (savedMonth !== monthKey) setMonth(savedMonth)
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('finance.deleteTitle', { name: pendingDelete.name })}
          description={t('finance.deleteDesc')}
          confirmLabel={t('common.delete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
