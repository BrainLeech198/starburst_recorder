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
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { FinanceEntry } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatMonthDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { SOLID_BUTTON, OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import {
  expenseByCategory,
  groupFinanceByDay,
  isMonthKey,
  monthKeyOf,
  shiftMonth,
  summarizeFinance,
} from './financeMath'
import { categoryKey } from './financeCategories'
import { exportAllData, financeOfMonth, removeFinance, restoreFinance } from './financeRepo'
import FinanceEntryDialog from './FinanceEntryDialog'
import FinanceAiDialog from './FinanceAiDialog'
import type { BackupData } from '@/core/db/store'
import RecordExportDialog from '@/features/records/RecordExportDialog'
import { buildSingleRecordExport } from '@/features/records/recordExport'
import {
  importRecords,
  isRecordsFile,
  readRecordsFile,
  recordsCount,
} from '@/features/records/recordImport'
import { describeSave, saveTextFile } from '@/platform/saveFile'

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
  const slices = expenseByCategory(rows)

  // 近半年趋势：每月各查一次汇总，跨年也按真实月份排
  const trendMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(currentMonth, index - 5))
  const trend = useLiveQuery(
    async () => {
      const lists = await Promise.all(trendMonths.map((key) => financeOfMonth(key)))
      return trendMonths.map((key, index) => ({ monthKey: key, ...summarizeFinance(lists[index]) }))
    },
    [currentMonth],
  )
  const trendMax = Math.max(1, ...(trend ?? []).map((item) => Math.max(item.income, item.expense)))

  /** 新增 / 编辑；date 是新增时预填的日期 */
  const [dialog, setDialog] = useState<{ entry: FinanceEntry | null; date: string } | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FinanceEntry | null>(null)
  /** 挑选导出时取来的整库数据；非 null 就打开挑选弹窗 */
  const [exportData, setExportData] = useState<BackupData | null>(null)
  /** 打开挑选弹窗时预选本月这些流水 */
  const [exportInitial, setExportInitial] = useState<{ finance: string[] } | undefined>(undefined)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  /** 单条导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportEntry(entry: FinanceEntry) {
    const file = buildSingleRecordExport('finance', entry)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  /** 挑选导出：把本月流水全部勾上，交给通用弹窗 */
  async function handleOpenExport() {
    if (rows.length === 0) return
    setExportInitial({ finance: rows.map((row) => row.id) })
    setExportData(await exportAllData())
  }

  /** 记录级 JSON 导入：只认收支，同 id 覆盖、其余追加 */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    const text = await picked.text()
    if (!isRecordsFile(text)) {
      showToast({ message: t('records.importBadFile') })
      return
    }
    const result = readRecordsFile(text)
    if (!result.ok || recordsCount(result.file, ['finance']) === 0) {
      showToast({ message: t(result.ok ? 'records.importNone' : 'records.importBadFile') })
      return
    }
    const done = await importRecords(result.file, ['finance'])
    showToast({
      message: t('records.importDone', {
        total: done.stats.finance.total,
        overwritten: done.stats.finance.overwritten,
      }),
    })
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {monthKey !== currentMonth && (
            <button
              type="button"
              onClick={() => setMonth(currentMonth)}
              className="text-xs text-brand transition-opacity hover:opacity-80"
            >
              {t('finance.currentMonth')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleOpenExport()}
            disabled={rows.length === 0}
            className="text-xs text-muted transition-colors hover:text-brand disabled:opacity-40"
          >
            {t('records.export')}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="text-xs text-muted transition-colors hover:text-brand"
          >
            {t('records.import')}
          </button>
          <Link
            to="/finance/trash"
            className="text-xs text-muted transition-colors hover:text-brand"
          >
            {t('finance.trash')}
          </Link>
          {/* 记录级 JSON 导入的隐藏文件框 */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
          />
        </div>
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
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => setDialog({ entry: null, date: defaultDate() })}
              className={SOLID_BUTTON}
            >
              {t('finance.add')}
            </button>
            <button type="button" onClick={() => setAiOpen(true)} className={OUTLINE_BUTTON}>
              {t('finance.aiAsk')}
            </button>
          </div>
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

      {/* 本月支出分类：按金额从大到小，条长就是占比 */}
      {slices.length > 0 && (
        <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="m-0 text-xs font-medium text-fg">{t('finance.breakdown')}</h2>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {slices.map((slice) => (
              <li key={slice.category}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-muted">
                    {t(categoryKey(slice.category))}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg">
                    {money(slice.amount)} · {Math.round(slice.share * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(2, slice.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 近半年收支：每月两根柱，同一标尺比较 */}
      {trend &&
        trend.some((item) => item.income > 0 || item.expense > 0) && (
          <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-xs font-medium text-fg">{t('finance.trend')}</h2>
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-brand" />
                  {t('finance.income')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-danger/60" />
                  {t('finance.expense')}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-end gap-2">
              {trend.map((item) => (
                <div
                  key={item.monthKey}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <div className="flex h-20 w-full items-end justify-center gap-1">
                    <div
                      className="w-2 rounded-t bg-brand"
                      style={{
                        height: `${(item.income / trendMax) * 100}%`,
                        minHeight: item.income > 0 ? 2 : 0,
                      }}
                    />
                    <div
                      className="w-2 rounded-t bg-danger/60"
                      style={{
                        height: `${(item.expense / trendMax) * 100}%`,
                        minHeight: item.expense > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] tabular-nums ${
                      item.monthKey === monthKey ? 'text-brand' : 'text-muted'
                    }`}
                  >
                    {item.monthKey.slice(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

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
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/diary?date=${day.dateKey}`}
                  className="text-[11px] text-brand transition-opacity hover:opacity-80"
                >
                  {t('finance.dayRecords')}
                </Link>
                <span className="text-[11px] tabular-nums text-muted">
                  {t('finance.dayExpense', { value: money(day.summary.expense) })}
                </span>
              </div>
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
                    {entry.photo && (
                      <img
                        src={entry.photo}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">
                      {t(categoryKey(entry.category))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{entry.name}</span>
                      <span className="block truncate text-[11px] tabular-nums text-muted">
                        {entry.time}
                        {entry.note !== '' && ` · ${entry.note}`}
                      </span>
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
                    onClick={() => void handleExportEntry(entry)}
                    title={t('records.export')}
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-1.5 font-mono text-[10px] text-muted transition-colors hover:text-brand"
                  >
                    JSON
                    <span className="sr-only">{t('records.export')}</span>
                  </button>
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

      {aiOpen && (
        <FinanceAiDialog
          defaultDate={defaultDate()}
          onClose={() => setAiOpen(false)}
          onManual={() => {
            setAiOpen(false)
            setDialog({ entry: null, date: defaultDate() })
          }}
        />
      )}

      {exportData && (
        <RecordExportDialog
          data={exportData}
          initial={exportInitial}
          onClose={() => setExportData(null)}
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
