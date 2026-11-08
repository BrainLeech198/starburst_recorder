/**
 * 经济首页 = 月账本，交互向摄入页看齐。
 *
 * 一屏之内按「时段 → 记一笔 → 概览 → 流水」排：
 *   - 时段进 URL，翻页和刷新都停在同一页；日 / 周 / 月 / 年随视角换单位
 *   - 日视图的日期栏直接点开日历，记过的天标亮
 *   - 记一笔 / 批量 / 导入 / 回收站排成一条按钮行（窄屏 2×2），和日记、健康首页一个结构
 *   - 整页左右滑就翻到上一个 / 下一个时段
 *   - 点击卡片信息看详情、缩略图看大图；也可从行尾菜单直接进入编辑
 *
 * 2026-11-02 排版重排（原来一屏里叠了四层控件、每笔流水占五行）：
 *   - 去掉页头大标题与散落的「导出 / 导入 / 回收站」文字按钮：日记、健康两页的页头
 *     本来就没有标题，低频动作一律落在按钮行里，导出只在批量条上出现
 *   - 结余与支出分类合成一张概览卡，用虚线分隔——两张同色同圆角的卡上下摞着，
 *     层次只剩「都一样」，分不清哪块是汇总哪块是明细
 *   - 时段条去掉「11月1日 – 11月30日」：标题已经写着月份，区间是同一条信息的复述，
 *     却把这一条挤成两行；年视图下它还会错显成当前月（见下）
 *   - 修年视图的错标：原来「本月」徽标与月份区间不分视角一律按当前月算，
 *     站在「2026 年」上看会冒出「本月」「11月1日 – 11月30日」，与年份自相矛盾
 *   - 流水卡沿用食物库的两行信息结构（名称 + 编号 / 时刻 + 分类）；金额保持醒目，
 *     编辑、分享、导出、删除收进一个行尾菜单，避免操作按钮挤占名称空间；「建于 …」与备注留在详情弹窗
 *   - 日视图不再重复日期：日期栏已经写着「2026年11月2日 星期一」，
 *     分组头又写一遍「11月2日 · 一」；改由概览卡右上角提供「查看当天记录」入口
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
import RowMenu from '@/shared/ui/RowMenu'
import ToolbarRow from '@/shared/ui/ToolbarRow'
import DayNav from '@/shared/ui/DayNav'
import { useBatchSelect } from '@/shared/ui/useBatchSelect'
import { useDaySwipe } from '@/shared/ui/useDaySwipe'
import { BAR_BUTTON, BAR_DANGER, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import Tab from '@/shared/ui/Tab'
import { Icon } from '@/shared/ui/icons'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import {
  expenseByCategory,
  type FinanceRow,
  financeWeeksOfMonth,
  groupFinanceByDay,
  isMonthKey,
  monthKeyOf,
  shiftMonth,
  summarizeFinance,
  weekBounds,
} from './financeMath'
import { categoryKey } from './financeCategories'
import {
  exportAllData,
  financeDays,
  financeBriefsOfMonth,
  financeById,
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
import ShareDialog from '@/features/share/ShareDialog'
import type { ShareFinanceDoc } from '@/features/share/shareCode'
import { buildFinanceShare } from '@/features/share/recordShare'
import FinancePhotoThumbnail from './FinancePhotoThumbnail'

/** 日头用星期几：JS 的 0=周日，正好对上 date.weekdayShortN */
function weekdayKey(dateKey: string): MessageKey {
  const day = new Date(dateKey + 'T00:00:00').getDay()
  return ('date.weekdayShort' + day) as MessageKey
}

/** 日 / 周 / 月 / 年四种观察视角 */
type FinanceView = 'day' | 'week' | 'month' | 'year'

interface FinanceChartBar {
  key: string
  label: string
  ariaLabel: string
  income: number
  expense: number
  onSelect?: () => void
}

function financePieColor(index: number, total: number) {
  return `hsl(${Math.round((index * 360) / Math.max(1, total))} 66% 56%)`
}

function financePieBackground(slices: Array<{ share: number }>) {
  let angle = 0
  const segments = slices.map((slice, index) => {
    const start = angle
    angle = index === slices.length - 1 ? 360 : angle + slice.share * 360
    return `${financePieColor(index, slices.length)} ${start}deg ${angle}deg`
  })
  return `conic-gradient(${segments.join(', ')})`
}

function FinanceBars({ bars, max }: { bars: FinanceChartBar[]; max: number }) {
  return (
    <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1">
      {bars.map((bar) => {
        const content = (
          <>
            <span className="flex h-24 w-full items-end justify-center gap-0.5">
              <span
                className="w-2 rounded-t bg-success"
                style={{ height: `${(bar.income / max) * 100}%`, minHeight: bar.income > 0 ? 2 : 0 }}
              />
              <span
                className="w-2 rounded-t bg-danger/60"
                style={{
                  height: `${(bar.expense / max) * 100}%`,
                  minHeight: bar.expense > 0 ? 2 : 0,
                }}
              />
            </span>
            <span className="max-w-full truncate text-[10px] tabular-nums text-muted">
              {bar.label}
            </span>
          </>
        )
        return bar.onSelect ? (
          <button
            key={bar.key}
            type="button"
            title={bar.ariaLabel}
            aria-label={bar.ariaLabel}
            onClick={bar.onSelect}
            className="flex min-w-[24px] flex-1 flex-col items-center gap-1 rounded-md px-0.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {content}
          </button>
        ) : (
          <div
            key={bar.key}
            role="img"
            title={bar.ariaLabel}
            aria-label={bar.ariaLabel}
            className="flex min-w-[24px] flex-1 flex-col items-center gap-1 px-0.5"
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

export default function FinancePage() {
  const { t, locale } = useI18n()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentMonth = monthKeyOf(todayKey())
  const currentYear = Number(currentMonth.slice(0, 4))

  /** 观察视角：日 / 周 / 月 / 年，跟着 URL 走，刷新与返回都停在同一视角 */
  const viewParam = searchParams.get('view')
  const view: FinanceView =
    viewParam === 'day'
      ? 'day'
      : viewParam === 'week'
        ? 'week'
        : viewParam === 'year'
          ? 'year'
          : 'month'

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
  const selectedWeek = weekBounds(dayKey)
  const selectedWeekMonths = [...new Set([monthKeyOf(selectedWeek.start), monthKeyOf(selectedWeek.end)])]
  const currentWeek = weekBounds(todayKey())

  // 「本月 / 上月」只在月视图成立；站在年视图上看它会是错的，所以按视角分别给
  const previousMonth = shiftMonth(currentMonth, -1)
  const relativeMonthKey: MessageKey | null =
    view !== 'month'
      ? null
      : monthKey === currentMonth
        ? 'finance.thisMonth'
        : monthKey === previousMonth
          ? 'finance.lastMonth'
          : null

  // 年视图按月各查一次；周视图最多跨两个月，拼起来再按周首尾筛选。
  const yearMonths = Array.from(
    { length: 12 },
    (_, index) => `${viewYear}-${String(index + 1).padStart(2, '0')}`,
  )
  const period = useLiveQuery(
    async () => {
      if (view === 'year') {
        const lists = await Promise.all(yearMonths.map((key) => financeBriefsOfMonth(key)))
        return {
          entries: lists.flat(),
          months: lists.map((list) => ({ ...summarizeFinance(list), count: list.length })),
        }
      }
      if (view === 'week') {
        const lists = await Promise.all(selectedWeekMonths.map((key) => financeBriefsOfMonth(key)))
        return {
          entries: lists
            .flat()
            .filter(
              (entry) =>
                entry.dateKey >= selectedWeek.start && entry.dateKey <= selectedWeek.end,
            ),
          months: null,
        }
      }
      const list = await financeBriefsOfMonth(view === 'day' ? monthKeyOf(dayKey) : monthKey)
      return { entries: list, months: null }
    },
    [view, viewYear, monthKey, dayKey, selectedWeek.start, selectedWeek.end],
  )
  const allRows = period?.entries ?? []
  const rows =
    view === 'day'
      ? allRows.filter((entry) => entry.dateKey === dayKey)
      : view === 'week'
        ? allRows.filter(
            (entry) => entry.dateKey >= selectedWeek.start && entry.dateKey <= selectedWeek.end,
          )
        : allRows
  const summary = summarizeFinance(rows)
  const days = groupFinanceByDay(rows)
  const slices = expenseByCategory(rows)
  const summariesByDay = new Map(days.map((day) => [day.dateKey, day.summary]))
  const weekDays =
    view === 'week'
      ? Array.from({ length: 7 }, (_, index) => {
          const dateKey = shiftDay(selectedWeek.start, index)
          const summary = summariesByDay.get(dateKey)
          return {
            dateKey,
            income: summary?.income ?? 0,
            expense: summary?.expense ?? 0,
          }
        })
      : []
  const weekDaysMax = Math.max(1, ...weekDays.map((day) => Math.max(day.income, day.expense)))
  const monthWeeks = view === 'month' ? financeWeeksOfMonth(rows, monthKey) : []
  const monthWeeksMax = Math.max(
    1,
    ...monthWeeks.map((item) => Math.max(item.income, item.expense)),
  )
  const yearSummaries = period?.months ?? []
  const yearMonthsMax = Math.max(
    1,
    ...yearSummaries.map((item) => Math.max(item.income, item.expense)),
  )
  const isCurrentYear = viewYear === currentYear

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
  const [sharing, setSharing] = useState<ShareFinanceDoc | null>(null)
  const [breakdownMode, setBreakdownMode] = useState<'pie' | 'bars'>('pie')
  /** 打开挑选弹窗时预选这些流水 */
  const [exportInitial, setExportInitial] = useState<{ finance: string[] } | undefined>(undefined)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  async function withFullEntry(entry: FinanceRow, action: (full: FinanceEntry) => void | Promise<void>) {
    const full = await financeById(entry.id)
    if (full) await action(full)
  }

  /** 单条导出：结构和「挑选记录导出」的 JSON 一样 */
  async function handleExportEntry(entry: FinanceEntry) {
    const file = buildSingleRecordExport('finance', entry)
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(outcome, t('records.exported', { count: 1, label: file.label }), t),
    })
  }

  /**
   * 挑选导出：勾了谁就预选谁，否则把当前时段流水全部勾上。
   * 入口只在批量条上——日记页也是这个动线，页头不再单挂一个「导出」。
   */
  async function handleOpenExport() {
    const ids = batch.active ? batch.selected : rows.map((row) => row.id)
    if (ids.length === 0) return
    setExportInitial({ finance: ids })
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

  function setWeekAnchor(next: string) {
    batch.exit()
    setSearchParams({ view: 'week', date: next }, { replace: true })
  }

  function setYear(next: number) {
    batch.exit()
    setSearchParams({ view: 'year', year: String(next) }, { replace: true })
  }

  /** 切视角时尽量沿用当前查看的日期区间。 */
  function setView(next: FinanceView) {
    if (next === 'day') setDayKey(view === 'day' || view === 'week' ? dayKey : todayKey())
    else if (next === 'year') setYear(view === 'year' ? viewYear : currentYear)
    else if (next === 'week') {
      const anchor =
        view === 'day' || view === 'week'
          ? dayKey
          : view === 'month'
            ? monthKey === currentMonth
              ? todayKey()
              : `${monthKey}-01`
            : isCurrentYear
              ? todayKey()
              : `${viewYear}-01-01`
      setWeekAnchor(anchor)
    } else setMonth(monthKey)
  }

  /** 当前视角下往前 / 往后翻一格：一天、一周、一个月或一年 */
  function step(delta: number) {
    if (view === 'day') setDayKey(shiftDay(dayKey, delta))
    else if (view === 'year') setYear(viewYear + delta)
    else if (view === 'week') setWeekAnchor(shiftDay(dayKey, delta * 7))
    else setMonth(shiftMonth(monthKey, delta))
  }

  // 左右滑动翻时段与箭头共用步进：日 / 周 / 月 / 年
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
    if (view === 'week') return dayKey
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

  /** 时段条的标题：日视图交给 DayNav，周 / 月 / 年在这里拼 */
  const periodTitle =
    view === 'year'
      ? t('finance.yearTitle', { year: viewYear })
      : view === 'week'
        ? t('finance.weekTitle', {
            year: selectedWeek.start.slice(0, 4),
            from: formatMonthDay(selectedWeek.start, t),
            to: formatMonthDay(selectedWeek.end, t),
          })
        : t('finance.monthTitle', { year: monthYear, month: monthNumber })

  return (
    <div
      className={'w-full p-4 ' + swipe.animationClass}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onAnimationEnd={swipe.onAnimationEnd}
    >
      {/* 视角切换放最上面：先定粒度（日 / 周 / 月 / 年），再看具体是哪一段。
          和日记页一样不再挂页面大标题——底部导航已经标着「经济」 */}
      <nav role="tablist" className="flex items-center gap-1">
        <Tab active={view === 'day'} onClick={() => setView('day')}>
          {t('finance.viewDay')}
        </Tab>
        <Tab active={view === 'week'} onClick={() => setView('week')}>
          {t('finance.viewWeek')}
        </Tab>
        <Tab active={view === 'month'} onClick={() => setView('month')}>
          {t('finance.viewMonth')}
        </Tab>
        <Tab active={view === 'year'} onClick={() => setView('year')}>
          {t('finance.viewYear')}
        </Tab>
      </nav>

      {/* 时段条：日 / 周 / 月 / 年共用一条外壳（吸顶、铺到容器边缘），切换视角时位置不变。
          日视图用公共 DayNav，日期本身能点开日历（记过的天标亮） */}
      {view === 'day' ? (
        <DayNav
          dayKey={dayKey}
          onChange={setDayKey}
          onPick={() => void openPicker()}
          inset={false}
          className="mt-1"
          labels={{
            prev: t('finance.prevDay'),
            next: t('finance.nextDay'),
            pick: t('finance.pickDate'),
            today: t('finance.backToToday'),
          }}
        />
      ) : (
        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-2 gap-y-1 bg-bg/95 px-4 pb-2 pt-2 backdrop-blur">
          <div className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-surface px-1 py-0.5">
            <button
              type="button"
              aria-label={
                view === 'year'
                  ? t('finance.prevYear')
                  : view === 'week'
                    ? t('finance.prevWeek')
                    : t('finance.prevMonth')
              }
              onClick={() => step(-1)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
            >
              ‹
            </button>

            <span className="flex min-w-0 items-center gap-2 px-1">
              {/* 徽标只在它成立的那个视角里出现：本月 / 上月归月视图，今年归年视图 */}
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
              {view === 'year' && isCurrentYear && (
                <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-success">
                  {t('finance.thisYear')}
                </span>
              )}
              <span className="whitespace-nowrap text-sm font-medium tabular-nums text-fg">
                {periodTitle}
              </span>
              {/* 不在当前时段时给一个回程按钮，形态照 DayNav 的「今天」 */}
              {view === 'month' && monthKey !== currentMonth && (
                <button
                  type="button"
                  onClick={() => setMonth(currentMonth)}
                  className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
                >
                  {t('finance.currentMonth')}
                </button>
              )}
              {view === 'year' && !isCurrentYear && (
                <button
                  type="button"
                  onClick={() => setYear(currentYear)}
                  className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
                >
                  {t('finance.thisYear')}
                </button>
              )}
              {view === 'week' && selectedWeek.start !== currentWeek.start && (
                <button
                  type="button"
                  onClick={() => setWeekAnchor(todayKey())}
                  className="ml-1 shrink-0 whitespace-nowrap rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-brand"
                >
                  {t('finance.currentWeek')}
                </button>
              )}
            </span>

            <button
              type="button"
              aria-label={
                view === 'year'
                  ? t('finance.nextYear')
                  : view === 'week'
                    ? t('finance.nextWeek')
                    : t('finance.nextMonth')
              }
              onClick={() => step(1)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base text-muted transition-colors hover:text-fg"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* 按钮条：第一行是「记录类」三个动作（记一笔 / 批量 / 问 AI），
          第二行是「数据类」两个（导入 / 回收站）。
          原来导出 / 导入 / 回收站散在页头当文字链，跟这里的大按钮各说各话；
          现在低频动作全部落到这条按钮行，跟日记、健康首页一个结构。
          窄屏排 3 列（流式换行会剩孤按钮），宽屏回到一行；批量时收起动作只留提示 */}
      <ToolbarRow className="mt-2 grid grid-cols-6 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {!batch.active ? (
          <>
            <button
              type="button"
              onClick={() => setDialog({ entry: null, date: defaultDate() })}
              className={`${SOLID_BUTTON} col-span-2`}
            >
              <Icon name="plus" />
              {t('finance.add')}
            </button>
            <button
              type="button"
              onClick={() => batch.enter()}
              disabled={rows.length === 0}
              className={`${SOLID_BUTTON} col-span-2 disabled:opacity-40`}
            >
              <Icon name="list" />
              {t('finance.batch')}
            </button>
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className={`${OUTLINE_BUTTON} col-span-2`}
            >
              <Icon name="sparkles" />
              {t('finance.aiAsk')}
            </button>
            {/* 第二行两个数据动作各占一半，不并成一条大按钮：
                回收站是低频动作，铺满整行反而比「记一笔」还显眼 */}
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={`${OUTLINE_BUTTON} col-span-3`}
            >
              <Icon name="import" />
              {t('records.import')}
            </button>
            <Link to="/finance/trash" className={`${SOLID_BUTTON} col-span-3`}>
              <Icon name="trash" />
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
          </>
        ) : (
          <span className="col-span-6 px-1 text-xs text-muted">{t('finance.batchHint')}</span>
        )}
      </ToolbarRow>

      {/* 概览卡：结余大数字 + 收支两栏 + 支出分类，一块卡里用虚线分段。
          原来拆成两张同色同圆角的卡，看不出哪块是汇总 */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="m-0 text-[11px] text-muted">
            {view === 'day'
              ? t('finance.balanceDay')
              : view === 'year'
                ? t('finance.balanceYear')
                : view === 'week'
                  ? t('finance.balanceWeek')
                  : t('finance.balance')}
          </p>
          {/* 日视图的日期栏已经写着是哪一天，这里补「当天记录」入口，不再重复日期。
              指向「一天一页」：那里把日记、随记、摄入、睡眠、训练、收支与日程排成一条时间轴 */}
          {view === 'day' ? (
            <Link
              to={`/day/${dayKey}`}
              className="shrink-0 text-[11px] text-brand transition-opacity hover:opacity-80"
            >
              {t('finance.dayRecords')} ›
            </Link>
          ) : (
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              {t('finance.entryCount', { n: rows.length })}
            </span>
          )}
        </div>
        <p
          className={`m-0 mt-1 text-3xl font-medium tabular-nums ${
            summary.balance < 0 ? 'text-danger' : 'text-fg'
          }`}
        >
          {money(summary.balance)}
        </p>

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

        {/* 支出分类可以在饼图和原进度条之间切换；分类金额与占比共用同一份汇总。 */}
        {slices.length > 0 && (
          <>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-line pt-3">
              <h2 className="m-0 min-w-0 text-xs font-medium text-fg">
                {t('finance.breakdown')}
              </h2>
              <div
                role="group"
                aria-label={t('finance.breakdown')}
                className="flex shrink-0 items-center rounded-lg bg-surface-2 p-0.5"
              >
                {([
                  ['pie', 'finance.pieChart'],
                  ['bars', 'finance.progressBars'],
                ] as const).map(([mode, labelKey]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={breakdownMode === mode}
                    onClick={() => setBreakdownMode(mode)}
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] ${
                      breakdownMode === mode
                        ? 'bg-surface text-fg shadow-sm'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            {breakdownMode === 'pie' && (
              <div
                aria-hidden="true"
                className="mx-auto mt-3 h-28 w-28 rounded-full border border-line"
                style={{ background: financePieBackground(slices) }}
              />
            )}
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {slices.map((slice, index) => (
                <li key={slice.category} className="flex items-center gap-2 text-[11px]">
                  {breakdownMode === 'pie' ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: financePieColor(index, slices.length) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {t(categoryKey(slice.category))}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-14 shrink-0 truncate text-muted">
                        {t(categoryKey(slice.category))}
                      </span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-danger/60"
                          style={{ width: `${Math.max(2, slice.share * 100)}%` }}
                        />
                      </span>
                    </>
                  )}
                  <span
                    title={`${money(slice.amount)} · ${Math.round(slice.share * 100)}%`}
                    className="w-28 shrink-0 truncate text-right tabular-nums text-fg"
                  >
                    {money(slice.amount)} · {Math.round(slice.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 月视图按自然周拆分当前月，收入与支出使用同一标尺。 */}
      {view === 'month' &&
        monthWeeks.some((item) => item.income > 0 || item.expense > 0) && (
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
            <FinanceBars
              max={monthWeeksMax}
              bars={monthWeeks.map((item) => {
                const label = formatMonthDay(item.rangeStart, t)
                const rangeLabel = `${formatMonthDay(item.rangeStart, t)} – ${formatMonthDay(item.rangeEnd, t)}`
                return {
                  key: item.weekStart,
                  label,
                  income: item.income,
                  expense: item.expense,
                  ariaLabel: t('finance.chartBucketLabel', {
                    label: rangeLabel,
                    income: money(item.income),
                    expense: money(item.expense),
                  }),
                }
              })}
            />
          </section>
        )}

      {/* 周视图拆成固定七天；无记录的日期也留一个零高度柱，便于横向比较整周。 */}
      {view === 'week' && weekDays.some((day) => day.income > 0 || day.expense > 0) && (
        <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-xs font-medium text-fg">{t('finance.weekTrend')}</h2>
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
          <FinanceBars
            max={weekDaysMax}
            bars={weekDays.map((day) => {
              const label = formatMonthDay(day.dateKey, t)
              return {
                key: day.dateKey,
                label,
                income: day.income,
                expense: day.expense,
                ariaLabel: t('finance.chartBucketLabel', {
                  label,
                  income: money(day.income),
                  expense: money(day.expense),
                }),
              }
            })}
          />
        </section>
      )}

      {period === undefined ? null : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🧾"
            text={t(
              view === 'day'
                ? 'finance.emptyDay'
                : view === 'week'
                  ? 'finance.emptyWeek'
                  : view === 'year'
                    ? 'finance.emptyYear'
                    : 'finance.empty',
            )}
          />
        </div>
      ) : view === 'year' ? (
        <section className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-surface-2 px-3 py-2">
            <h2 className="m-0 text-xs font-medium text-fg">{t('finance.yearMonths')}</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-success" />
                {t('finance.income')}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-danger/60" />
                {t('finance.expense')}
              </span>
              <span className="text-[11px] tabular-nums">{t('finance.entryCount', { n: rows.length })}</span>
            </div>
          </header>
          <div className="px-3 pb-3">
            <FinanceBars
              max={yearMonthsMax}
              bars={yearSummaries.map((item, index) => {
                const monthValue = index + 1
                const monthLabel = monthFormatter.format(new Date(viewYear, index, 1))
                return {
                  key: `${viewYear}-${String(monthValue).padStart(2, '0')}`,
                  label: monthLabel,
                  income: item.income,
                  expense: item.expense,
                  ariaLabel: t('finance.chartBucketLabel', {
                    label: monthLabel,
                    income: money(item.income),
                    expense: money(item.expense),
                  }),
                  onSelect: () => setMonth(`${viewYear}-${String(monthValue).padStart(2, '0')}`),
                }
              })}
            />
          </div>
        </section>
      ) : (
        days.map((day) => (
          <section key={day.dateKey} className="mt-3">
            {/* 日视图不重复日期：日期栏已经写着是哪一天 */}
            {view !== 'day' && (
              <header className="flex items-center justify-between gap-2 px-1 pb-1.5">
                <span className="min-w-0 truncate text-xs text-fg">
                  {formatMonthDay(day.dateKey, t)} · {t(weekdayKey(day.dateKey))}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/day/${day.dateKey}`}
                    className="text-[11px] text-brand transition-opacity hover:opacity-80"
                  >
                    {t('finance.dayRecords')}
                  </Link>
                  <span className="text-[11px] tabular-nums text-muted">
                    {t('finance.dayExpense', { value: money(day.summary.expense) })}
                  </span>
                </div>
              </header>
            )}
            <ul className={`m-0 list-none space-y-2 p-0 ${view === 'day' ? '' : 'mt-0.5'}`}>
              {day.entries.map((entry) => {
                const selected = batch.isSelected(entry.id)
                return (
                  <li
                    key={entry.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
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
                    <FinancePhotoThumbnail
                      id={entry.id}
                      hasPhoto={Boolean(entry.hasPhoto)}
                      refreshKey={entry.updatedAt}
                    />
                    {/* 两行：名称 + 编号 / 时刻 + 分类。
                        备注与「建于 …」留给详情弹窗，列表里每笔都占一行只会把名字挤没 */}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={batch.active}
                        onClick={() => void withFullEntry(entry, setViewEntry)}
                        className="block w-full rounded text-left transition-colors hover:text-brand disabled:cursor-default"
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 truncate text-sm text-fg">{entry.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted">
                            {entry.code}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-baseline gap-2 text-[11px] text-muted">
                          <span className="shrink-0 tabular-nums">{entry.time}</span>
                          <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5">
                            {t(categoryKey(entry.category))}
                          </span>
                        </span>
                      </button>
                    </div>
                    {/* 金额与名称同一行起读，收支方向仍用颜色和正负号区分。 */}
                    <span
                      className={`shrink-0 pt-1 text-sm tabular-nums ${
                        entry.kind === 'income' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {entry.kind === 'income' ? '+' : '-'}
                      {money(entry.amount)}
                    </span>
                    {/* 低频操作收在三个点里，卡面只留一个轻量入口。 */}
                    {!batch.active && (
                      <RowMenu
                        label={t('common.more')}
                        items={[
                          {
                            label: t('finance.editEntry'),
                            icon: 'edit',
                            onSelect: () =>
                              void withFullEntry(entry, (full) =>
                                setDialog({ entry: full, date: full.dateKey }),
                              ),
                          },
                          {
                            label: t('share.action'),
                            icon: 'share',
                            onSelect: () =>
                              void withFullEntry(entry, (full) => setSharing(buildFinanceShare(full))),
                          },
                          {
                            label: t('records.export'),
                            icon: 'export',
                            onSelect: () =>
                              void withFullEntry(entry, (full) => handleExportEntry(full)),
                          },
                          {
                            label: t('common.delete'),
                            icon: 'trash',
                            danger: true,
                            onSelect: () => void withFullEntry(entry, setPendingDelete),
                          },
                        ]}
                      />
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
            onClick={() => void handleOpenExport()}
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

      {sharing && <ShareDialog doc={sharing} onClose={() => setSharing(null)} />}

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
