/**
 * 经济首页 = 月账本，交互向摄入页看齐。
 *
 * 一屏之内按「结余 → 记一笔 → 按天流水」排：
 *   - 时段进 URL，翻页和刷新都停在同一页；日 / 月 / 年随视角换单位
 *   - 日视图的日期栏直接点开日历，记过的天标亮
 *   - 记一笔 / 批量收进按钮条，批量和摄入一个套路：勾选 → 底部条 → 删除可撤销
 *   - 整页左右滑就翻到上一个 / 下一个时段
 *   - 单击一行先看详情，改金额走行内或详情里的编辑按钮
 *
 * 分类先用内置的那批，数据层只存分类 id；预算、账户、定期账单留到后面再加。
 */
import EmptyState from '@/shared/ui/EmptyState'
import RowCheckbox from '@/shared/ui/RowCheckbox'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { FinanceEntry } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatMonthDay, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import BatchActions from '@/shared/ui/BatchActions'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import TimeMeta from '@/shared/ui/TimeMeta'
import DayNav from '@/shared/ui/DayNav'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { BAR_BUTTON, BAR_DANGER, SOLID_BUTTON, OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import Tab from '@/shared/ui/Tab'
import { Icon } from '@/shared/ui/icons'
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
import {
  exportAllData,
  financeDays,
  financeOfMonth,
  removeFinance,
  removeFinances,
  restoreFinance,
  restoreFinances,
} from './financeRepo'
import FinanceEntryDialog from './FinanceEntryDialog'
import FinanceDetailDialog from './FinanceDetailDialog'
import FinanceAiDialog from './FinanceAiDialog'
import type { BackupData } from '@/core/db/store'
import DatePickerDialog from '@/features/diary/DatePickerDialog'
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

/** 日 / 月 / 年三种观察视角 */
type FinanceView = 'day' | 'month' | 'year'

export default function FinancePage() {
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentMonth = monthKeyOf(todayKey())
  const currentYear = Number(currentMonth.slice(0, 4))

  /** 观察视角：日 / 月 / 年，跟着 URL 走，刷新与返回都停在同一视角 */
  const viewParam = searchParams.get('view')
  const view: FinanceView =
    viewParam === 'day' ? 'day' : viewParam === 'year' ? 'year' : 'month'

  const dateParam = searchParams.get('date')
  const dayKey = isDateKey(dateParam) ? dateParam : todayKey()
  const monthParam = searchParams.get('month')
  const monthKey = isMonthKey(monthParam)
    ? monthParam
    : view === 'day'
      ? monthKeyOf(dayKey)
      : currentMonth
  const monthYear = Number(monthKey.slice(0, 4))
  const monthNumber = Number(monthKey.slice(5, 7))
  const yearParam = searchParams.get('year')
  const viewYear = /^\d{4}$/.test(yearParam ?? '') ? Number(yearParam) : currentYear

  const previousMonth = shiftMonth(currentMonth, -1)
  const relativeMonthKey: MessageKey | null =
    monthKey === currentMonth
      ? 'finance.thisMonth'
      : monthKey === previousMonth
        ? 'finance.lastMonth'
        : null
  const lastDay = new Date(monthYear, monthNumber, 0).getDate()
  const monthRange = t('finance.monthRange', {
    from: formatMonthDay(`${monthKey}-01`, t),
    to: formatMonthDay(`${monthKey}-${String(lastDay).padStart(2, '0')}`, t),
  })

  // 年视图按月各查一次，跨库都是同一套读法；月视图只查一个月，日视图在那一个月里筛出当天
  const yearMonths = Array.from(
    { length: 12 },
    (_, index) => `${viewYear}-${String(index + 1).padStart(2, '0')}`,
  )
  const period = useLiveQuery(
    async () => {
      if (view === 'year') {
        const lists = await Promise.all(yearMonths.map((key) => financeOfMonth(key)))
        return {
          entries: lists.flat(),
          months: lists.map((list) => ({ ...summarizeFinance(list), count: list.length })),
        }
      }
      const list = await financeOfMonth(view === 'day' ? monthKeyOf(dayKey) : monthKey)
      return { entries: list, months: null }
    },
    [view, viewYear, monthKey, dayKey],
  )
  const allRows = period?.entries ?? []
  const rows =
    view === 'day' ? allRows.filter((entry) => entry.dateKey === dayKey) : allRows
  const summary = summarizeFinance(rows)
  const days = groupFinanceByDay(rows)
  const slices = expenseByCategory(rows)
  const isCurrentYear = viewYear === currentYear

  // 近半年趋势：每月各查一次汇总，跨年也按真实月份排
  const trendMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(currentMonth, index - 5))
  const trend = useLiveQuery(
    async () => {
      if (view !== 'month') return []
      const lists = await Promise.all(trendMonths.map((key) => financeOfMonth(key)))
      return trendMonths.map((key, index) => ({ monthKey: key, ...summarizeFinance(lists[index]) }))
    },
    [currentMonth, view],
  )
  const trendMax = Math.max(1, ...(trend ?? []).map((item) => Math.max(item.income, item.expense)))

  /** 新增 / 编辑；date 是新增时预填的日期 */
  const [dialog, setDialog] = useState<{ entry: FinanceEntry | null; date: string } | null>(null)
  /** 单击流水行打开的查看弹窗 */
  const [viewEntry, setViewEntry] = useState<FinanceEntry | null>(null)
  /** 批量模式，状态机与摄入 / 日记共用 */
  const batch = useBatchSelect()
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  /** 日视图的日期弹窗；打开时查一遍记过收支的天用来标亮 */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [writtenDays, setWrittenDays] = useState<Set<string>>(new Set())
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

  /** 挑选导出：批量模式勾了谁就预选谁，否则把当前时段流水全部勾上 */
  async function handleOpenExport() {
    const ids = batch.active ? batch.selected : rows.map((row) => row.id)
    if (ids.length === 0) return
    setExportInitial({ finance: ids })
    setExportData(await exportAllData())
  }

  /** 批量条上的导出：先取整库数据，再打开挑选弹窗 */
  async function handleBatchExport() {
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

  /** 年视图的月份名交给 Intl，中文“11月”、英文“Nov”，不用再补文案 */
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' })

  function setMonth(next: string) {
    // 换时段要退出批量：选中的 id 属于旧时段，留着会删到看不见的记录
    batch.exit()
    setSearchParams({ month: next }, { replace: true })
  }

  function setDayKey(next: string) {
    batch.exit()
    setSearchParams({ view: 'day', date: next }, { replace: true })
  }

  function setYear(next: number) {
    batch.exit()
    setSearchParams({ view: 'year', year: String(next) }, { replace: true })
  }

  /** 切视角时把当前停留的日期带过去，不让人重新找位置 */
  function setView(next: FinanceView) {
    if (next === 'day') setDayKey(view === 'day' ? dayKey : todayKey())
    else if (next === 'year') setYear(view === 'year' ? viewYear : currentYear)
    else setMonth(monthKey)
  }

  /** 当前视角下往前 / 往后翻一格：一天、一个月或一年 */
  function step(delta: number) {
    if (view === 'day') setDayKey(shiftDay(dayKey, delta))
    else if (view === 'year') setYear(viewYear + delta)
    else setMonth(shiftMonth(monthKey, delta))
  }

  // 左右滑动翻时段：日视图换天，月 / 年视图换月换年，和翻页箭头同一套步进
  const swipe = useDaySwipe(
    () => step(-1),
    () => step(1),
  )

  async function openPicker() {
    setWrittenDays(new Set(await financeDays()))
    setPickerOpen(true)
  }

  /** 看的是哪段就往哪段记；不在当前时段时落在它的第一天 */
  function defaultDate() {
    if (view === 'day') return dayKey
    if (view === 'year') return isCurrentYear ? todayKey() : `${viewYear}-01-01`
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

  async function handleBatchDelete() {
    const ids = batch.selected
    setBatchDeleteOpen(false)
    await removeFinances(ids)
    batch.clear()
    showToast({
      message: t('finance.batchDeleted', { n: ids.length }),
      actionLabel: t('diary.undo'),
      onAction: () => {
        void restoreFinances(ids)
      },
    })
  }

  return (
    <div
      className={'w-full p-4 ' + swipe.animationClass}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-lg font-medium text-fg">{t('nav.finance')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'year' && !isCurrentYear && (
            <button
              type="button"
              onClick={() => setYear(currentYear)}
              className="inline-flex items-center text-xs text-brand transition-opacity hover:opacity-80"
            >
              <Icon name="calendar" className="mr-1 h-3.5 w-3.5 shrink-0" />
              {t('finance.thisYear')}
            </button>
          )}
          {view === 'month' && monthKey !== currentMonth && (
            <button
              type="button"
              onClick={() => setMonth(currentMonth)}
              className="inline-flex items-center text-xs text-brand transition-opacity hover:opacity-80"
            >
              <Icon name="calendar" className="mr-1 h-3.5 w-3.5 shrink-0" />
              {t('finance.currentMonth')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleOpenExport()}
            disabled={rows.length === 0}
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs text-muted transition-colors hover:text-brand disabled:opacity-40"
          >
            <Icon name="export" className="mr-1 h-3.5 w-3.5 shrink-0" />
            {t('records.export')}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs text-muted transition-colors hover:text-brand"
          >
            <Icon name="import" className="mr-1 h-3.5 w-3.5 shrink-0" />
            {t('records.import')}
          </button>
          <Link
            to="/finance/trash"
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs text-muted transition-colors hover:text-brand"
          >
            <Icon name="trash" className="mr-1 h-3.5 w-3.5 shrink-0" />
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

      {/* 视角切换：日 / 月 / 年，和日记页的栏目切换同一套下划线样式 */}
      <nav role="tablist" className="mt-3 flex items-center gap-1">
        <Tab active={view === 'day'} onClick={() => setView('day')}>
          {t('finance.viewDay')}
        </Tab>
        <Tab active={view === 'month'} onClick={() => setView('month')}>
          {t('finance.viewMonth')}
        </Tab>
        <Tab active={view === 'year'} onClick={() => setView('year')}>
          {t('finance.viewYear')}
        </Tab>
      </nav>

      {/* 日视图：日期栏直接用公共 DayNav，日期本身能点开日历（记过的天标亮） */}
      {view === 'day' ? (
        <DayNav
          dayKey={dayKey}
          onChange={setDayKey}
          onPick={() => void openPicker()}
          inset={false}
          className="mt-2"
          labels={{
            prev: t('finance.prevDay'),
            next: t('finance.nextDay'),
            pick: t('finance.pickDate'),
            today: t('finance.backToToday'),
          }}
        />
      ) : (
        /* 月 / 年翻页：标题居中，左右各一个箭头 */
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-2 py-1">
          <button
            type="button"
            aria-label={view === 'year' ? t('finance.prevYear') : t('finance.prevMonth')}
            onClick={() => step(-1)}
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
            {isCurrentYear && (
              <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-success">
                {t('finance.thisYear')}
              </span>
            )}
            <span className="text-sm font-medium tabular-nums text-fg">
              {view === 'year'
                ? t('finance.yearTitle', { year: viewYear })
                : t('finance.monthTitle', { year: monthYear, month: monthNumber })}
            </span>
            <span className="hidden shrink-0 text-xs tabular-nums text-muted min-[360px]:inline">
              {monthRange}
            </span>
          </span>
          <button
            type="button"
            aria-label={view === 'year' ? t('finance.nextYear') : t('finance.nextMonth')}
            onClick={() => step(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-brand"
          >
            ›
          </button>
        </div>
      )}

      {/* 按钮条：记一笔 / 批量 / 问 AI 收进同一条，和摄入页的按钮行一个结构 */}
      <ToolbarRow className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {!batch.active ? (
          <>
            <button
              type="button"
              onClick={() => setDialog({ entry: null, date: defaultDate() })}
              className={SOLID_BUTTON}
            >
              <Icon name="plus" />
              {t('finance.add')}
            </button>
            <button
              type="button"
              onClick={() => batch.enter()}
              disabled={rows.length === 0}
              className={`${SOLID_BUTTON} disabled:opacity-40`}
            >
              <Icon name="list" />
              {t('finance.batch')}
            </button>
            <button type="button" onClick={() => setAiOpen(true)} className={OUTLINE_BUTTON}>
              <Icon name="sparkles" />
              {t('finance.aiAsk')}
            </button>
          </>
        ) : (
          <span className="col-span-3 px-1 text-xs text-muted">{t('finance.batchHint')}</span>
        )}
      </ToolbarRow>

      {/* 结余卡：大数字 + 收支两栏 */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="min-w-0">
          <p className="m-0 text-[11px] text-muted">
            {view === 'day'
              ? t('finance.balanceDay')
              : view === 'year'
                ? t('finance.balanceYear')
                : t('finance.balance')}
          </p>
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
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] text-muted">{t('finance.income')}</p>
            <p className="m-0 mt-0.5 truncate text-sm tabular-nums text-success">
              +{money(summary.income)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="m-0 text-[11px] text-muted">{t('finance.expense')}</p>
            <p className="m-0 mt-0.5 truncate text-sm tabular-nums text-danger">
              -{money(summary.expense)}
            </p>
          </div>
        </div>
      </section>

      {/* 当前时段的支出分类：按金额从大到小，条长就是占比 */}
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
                    className="h-full rounded-full bg-danger/60"
                    style={{ width: `${Math.max(2, slice.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 近半年收支：只在月视图出现，每月两根柱，同一标尺比较 */}
      {view === 'month' &&
        trend &&
        trend.some((item) => item.income > 0 || item.expense > 0) && (
          <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-xs font-medium text-fg">{t('finance.trend')}</h2>
              <div className="flex items-center gap-2 text-[10px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-success" />
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
                      className="w-2 rounded-t bg-success"
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

      {period === undefined ? null : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🧾"
            text={t(
              view === 'day'
                ? 'finance.emptyDay'
                : view === 'year'
                  ? 'finance.emptyYear'
                  : 'finance.empty',
            )}
          />
        </div>
      ) : view === 'year' ? (
        <section className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2">
            <h2 className="m-0 text-xs font-medium text-fg">{t('finance.yearMonths')}</h2>
            <span className="text-[11px] tabular-nums text-muted">
              {t('finance.entryCount', { n: rows.length })}
            </span>
          </header>
          <ul className="m-0 list-none p-0">
            {(period.months ?? [])
              .map((item, index) => ({ ...item, monthValue: index + 1 }))
              .filter((item) => item.count > 0)
              .map((item) => (
                <li key={item.monthValue}>
                  <button
                    type="button"
                    onClick={() =>
                      setMonth(`${viewYear}-${String(item.monthValue).padStart(2, '0')}`)
                    }
                    className="flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="w-14 shrink-0 text-sm text-fg">
                      {monthFormatter.format(new Date(viewYear, item.monthValue - 1, 1))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-muted">
                      <span className="text-success">+{money(item.income)}</span>
                      {' · '}
                      <span className="text-danger">-{money(item.expense)}</span>
                    </span>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${
                        item.balance < 0 ? 'text-danger' : 'text-fg'
                      }`}
                    >
                      {money(item.balance)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        days.map((day) => (
          <section key={day.dateKey} className="mt-3">
            <header className="flex items-center justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-surface-2 px-3 py-2">
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
            <ul className="m-0 mt-2 list-none space-y-2 p-0">
              {day.entries.map((entry) => {
                const selected = batch.isSelected(entry.id)
                return (
                  <li
                    key={entry.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 sm:flex-nowrap ${
                      selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                    }`}
                  >
                    {batch.active && (
                      <RowCheckbox
                        checked={selected}
                        label={entry.name}
                        onToggle={() => batch.toggle(entry.id)}
                      />
                    )}
                    {entry.photo && (
                      <img
                        src={entry.photo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-11 w-11 shrink-0 rounded-lg border border-line/60 object-cover"
                      />
                    )}
                    <span className="hidden shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-muted sm:inline-flex">
                      {entry.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={batch.active}
                        onClick={() => setViewEntry(entry)}
                        className="block w-full rounded text-left transition-colors hover:text-brand disabled:cursor-default"
                      >
                        <p className="m-0 text-sm text-fg">
                          <span className="min-w-0 truncate">{entry.name}</span>
                        </p>
                        <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                          <span className="tabular-nums sm:hidden">{entry.time}</span>
                          <span className="font-mono">
                            {entry.code}
                          </span>
                          <span className="rounded-md border border-line px-1.5 py-0.5">
                            {t(categoryKey(entry.category))}
                          </span>
                        </p>
                        {entry.note !== '' && (
                          <p className="m-0 mt-0.5 truncate text-xs text-muted">{entry.note}</p>
                        )}
                      </button>
                      <TimeMeta createdAt={entry.createdAt} updatedAt={entry.updatedAt} />
                    </div>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${
                        entry.kind === 'income' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {entry.kind === 'income' ? '+' : '-'}
                      {money(entry.amount)}
                    </span>
                    {!batch.active && (
                      <div className="flex w-full items-center justify-end gap-1 border-t border-line/60 pt-2 sm:w-auto sm:border-0 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => setDialog({ entry, date: entry.dateKey })}
                          title={t('finance.editEntry')}
                          aria-label={t('finance.editEntry')}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm text-muted transition-colors hover:text-brand"
                        >
                          ✎
                        </button>
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
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {batch.active && (
        <BatchActions select={batch} ids={rows.map((row) => row.id)} unit={t('finance.unitEntry')}>
          <button
            type="button"
            onClick={() => void handleBatchExport()}
            disabled={batch.count === 0}
            className={BAR_BUTTON}
          >
            {t('finance.exportEntries')}
          </button>
          <button
            type="button"
            onClick={() => setBatchDeleteOpen(true)}
            disabled={batch.count === 0}
            className={BAR_DANGER}
          >
            {t('common.delete')}
          </button>
        </BatchActions>
      )}

      {batchDeleteOpen && (
        <ConfirmDialog
          title={t('finance.batchDeleteTitle', { n: batch.count })}
          description={t('finance.batchDeleteBody')}
          confirmLabel={t('common.delete')}
          onConfirm={() => void handleBatchDelete()}
          onCancel={() => setBatchDeleteOpen(false)}
        />
      )}

      {pickerOpen && (
        <DatePickerDialog
          value={dayKey}
          highlightDays={writtenDays}
          onConfirm={(next) => {
            setPickerOpen(false)
            setDayKey(next)
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {viewEntry && (
        <FinanceDetailDialog
          entry={viewEntry}
          money={money}
          onClose={() => setViewEntry(null)}
          onEdit={() => {
            setDialog({ entry: viewEntry, date: viewEntry.dateKey })
            setViewEntry(null)
          }}
        />
      )}

      {dialog && (
        <FinanceEntryDialog
          entry={dialog.entry}
          defaultDate={dialog.date}
          onClose={() => setDialog(null)}
          onSaved={(record) => {
            // 记到别的时段时直接翻过去，不然刚记的一笔会“消失”
            if (view === 'day') {
              if (record.dateKey !== dayKey) setDayKey(record.dateKey)
            } else if (view === 'year') {
              const savedYear = Number(record.dateKey.slice(0, 4))
              if (savedYear !== viewYear) setYear(savedYear)
            } else {
              const savedMonth = monthKeyOf(record.dateKey)
              if (savedMonth !== monthKey) setMonth(savedMonth)
            }
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
