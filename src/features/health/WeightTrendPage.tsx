/**
 * 体重趋势详情页：首页那张小折线图点进来，专门看走势。
 *
 * 结构按「先看走势，再看那一天的细节」排：
 *   1. 区间切换 + 可点的折线图（点一下选一天，选中点放大并拉竖线）
 *   2. 体重摘要：最新 / 首尾变化 / 回归周均 / 平均与高低
 *   3. 区间健康概览：日均摄入、日均睡眠、蛋白达标天数、推算 TDEE
 *   4. 选中那天的体重、能量差、蛋白达成、睡眠达标，以及摄入 / 睡眠明细
 *   5. 区间内的称重记录，兼作图表的无障碍替代（键盘也能选日期）
 *
 * 首页卡片只放 3/5/7/30 天，这里放宽到 90 天；体重来自身体档案的 weighIns，
 * 摄入和睡眠走区间批量查询，不逐日打库、也不额外落表。
 */
import EmptyState from '@/shared/ui/EmptyState'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { WeighIn } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatMonthDay, isDateKey, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { NAV_BACK_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { dayTargets, derivedTdee, formatNum, round2, sumMacros } from './healthMath'
import {
  DETAIL_TREND_RANGES,
  bmiValue,
  healthRangeSummary,
  sleepWakeMessage,
  trendWeighIns,
  weightTrendStats,
} from './healthViz'
import type { TrendRange } from './healthViz'
import { sleepMinutes, sleepParts, sleepWakeStats } from './sleepMath'
import {
  healthProfile,
  intakesBetween,
  intakesOfDay,
  sleepOfDay,
  sleepsBetween,
} from './healthRepo'
import WeightTrendChart from './WeightTrendChart'

/** 正数补个加号，负号 Number 自己带；0 也写成 0 */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNum(value)}`
}

/** 摘要格子：标签 + 大数字 + 一行补充说明 */
function StatCell({
  label,
  value,
  unit,
  hint,
}: {
  label: string
  value: string
  unit: string
  hint?: string | null
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="m-0 text-[11px] text-muted">{label}</p>
      <p className="m-0 mt-1 text-lg font-medium tabular-nums text-fg">
        {value}
        <span className="ml-1 text-[11px] font-normal text-muted">{unit}</span>
      </p>
      {hint ? <p className="m-0 mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}

/** 选中日期下面那排小指标：只放能算出来的，算不出就不占位 */
function MetricChip({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-2 py-2 text-center">
      <p className="m-0 text-[10px] text-muted">{label}</p>
      <p className="m-0 mt-0.5 text-sm tabular-nums text-fg">
        {value}
        {unit ? <span className="ml-0.5 text-[10px] text-muted">{unit}</span> : null}
      </p>
    </div>
  )
}

export default function WeightTrendPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState<TrendRange>(30)

  const profile = useLiveQuery(() => healthProfile(), [])
  const weighIns = profile?.weighIns ?? []
  const today = todayKey()
  const rangeItems = trendWeighIns(weighIns, range, today)
  const stats = weightTrendStats(rangeItems)
  const bmi = stats ? bmiValue(stats.latest, profile?.heightCm) : null

  // 选中日期放 URL：刷新、返回都还停在那天；区间外的旧日期自动退回最新一条
  const dateParam = searchParams.get('date')
  const selectedKey =
    isDateKey(dateParam) && rangeItems.some((item) => item.dateKey === dateParam)
      ? dateParam
      : (rangeItems[rangeItems.length - 1]?.dateKey ?? null)

  const selected = selectedKey
    ? (weighIns.find((item) => item.dateKey === selectedKey) ?? null)
    : null
  const previous: WeighIn | null =
    selectedKey && selected
      ? ([...weighIns]
          .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1))
          .filter((item) => item.dateKey < selected.dateKey)
          .pop() ?? null)
      : null

  const intakes = useLiveQuery(
    () => (selectedKey ? intakesOfDay(selectedKey) : Promise.resolve([])),
    [selectedKey],
  )
  const sleep = useLiveQuery(
    () => (selectedKey ? sleepOfDay(selectedKey) : Promise.resolve(undefined)),
    [selectedKey],
  )

  const totals = sumMacros(intakes ?? [])
  const targets = dayTargets(intakes ?? [], profile, selectedKey === today)
  const sleepMin = sleep ? sleepMinutes(sleep.bedtime, sleep.wakeTime) : 0
  const sleepPartsValue = sleepParts(sleepMin)
  const wakeStats = sleep ? sleepWakeStats(sleep) : null
  const wakeMessage = wakeStats ? sleepWakeMessage(wakeStats.count, wakeStats.minutes) : null

  // 区间内的摄入与睡眠一次取回，用来算日均、蛋白达标和推算 TDEE
  const rangeStart = shiftDay(today, -(range - 1))
  const rangeData = useLiveQuery(async () => {
    const [entries, nights] = await Promise.all([
      intakesBetween(rangeStart, today),
      sleepsBetween(rangeStart, today),
    ])
    return { intakes: entries, sleeps: nights }
  }, [rangeStart, today])
  const summary = healthRangeSummary({
    intakes: rangeData?.intakes ?? [],
    sleeps: rangeData?.sleeps ?? [],
    proteinTarget: profile?.proteinTarget ?? null,
  })
  const intakeKcalByDay: Record<string, number> = {}
  for (const intake of rangeData?.intakes ?? []) {
    intakeKcalByDay[intake.dateKey] = (intakeKcalByDay[intake.dateKey] ?? 0) + intake.kcal
  }
  const derived = profile ? derivedTdee({ weighIns: profile.weighIns, intakeKcalByDay }) : null
  const avgSleepHours =
    summary.avgSleepMinutes === null
      ? null
      : Math.round((summary.avgSleepMinutes / 60) * 10) / 10

  // 选中那天的三项派生指标：能量差、蛋白达成、与理想睡眠的差
  const energyGap =
    targets.tdee !== null && intakes && intakes.length > 0
      ? round2(totals.kcal - targets.tdee)
      : null
  const proteinRate =
    targets.proteinTarget && targets.proteinTarget > 0 && intakes && intakes.length > 0
      ? Math.round((totals.protein / targets.proteinTarget) * 100)
      : null
  const idealSleepMin = profile ? sleepMinutes(profile.idealBedtime, profile.idealWakeTime) : 0
  const sleepDelta = sleep && idealSleepMin > 0 ? sleepMin - idealSleepMin : null

  function selectDay(dateKey: string) {
    setSearchParams({ date: dateKey }, { replace: true })
  }

  return (
    <div className="w-full p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Link to="/health" className={NAV_BACK_BUTTON}>
          <span aria-hidden="true">‹</span>
          {t('nav.health')}
        </Link>
        <h1 className="m-0 text-base font-medium text-fg">{t('health.trendPageTitle')}</h1>
        <Link
          to="/health/weights"
          className="ml-auto text-xs text-muted transition-colors hover:text-brand"
        >
          {t('health.weighTitle')} ›
        </Link>
      </header>
      <p className="m-0 mt-2 text-xs text-muted">{t('health.trendPageHint')}</p>

      {profile === undefined ? null : weighIns.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="⚖️" text={t('health.weightBatchEmpty')} />
          <div className="mt-3 text-center">
            <Link to="/health/weights" className="text-xs text-brand underline">
              {t('health.weighRecord')} ›
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 图表：区间切换放在同一张卡里，避免和图分开后不知道切的是哪段 */}
          <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{t('health.trendTitle')}</span>
              <div className="flex items-center gap-1">
                {DETAIL_TREND_RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={range === item}
                    onClick={() => setRange(item)}
                    className={choiceTile(range === item, 'px-2 py-1 text-[11px]')}
                  >
                    {t('health.trendDays', { n: item })}
                  </button>
                ))}
              </div>
            </div>
            <WeightTrendChart
              items={rangeItems}
              tall
              selected={selectedKey}
              onSelect={selectDay}
            />
            {rangeItems.length > 0 && (
              <p className="m-0 mt-1 text-[11px] text-muted">{t('health.trendTapHint')}</p>
            )}
          </section>

          {stats && (
            <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCell
                label={t('health.trendStatLatest')}
                value={formatNum(stats.latest)}
                unit={t('health.weighUnit')}
                hint={bmi === null ? null : `${t('health.trendBmi')} ${formatNum(bmi)}`}
              />
              <StatCell
                label={t('health.trendStatChange')}
                value={signed(stats.delta)}
                unit={t('health.weighUnit')}
                hint={t('health.trendStatSpan', { n: stats.spanDays })}
              />
              <StatCell
                label={t('health.trendStatWeekly')}
                value={stats.weekly === null ? '—' : signed(stats.weekly)}
                unit={stats.weekly === null ? '' : t('health.trendWeekUnit')}
              />
              <StatCell
                label={t('health.trendStatAverage')}
                value={formatNum(stats.average)}
                unit={t('health.weighUnit')}
                hint={
                  stats.min === stats.max
                    ? null
                    : `${formatNum(stats.min)} – ${formatNum(stats.max)}`
                }
              />
            </section>
          )}

          {/* 区间健康概览：只按有记录的天 / 夜平均，空白日不参与 */}
          <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-xs text-muted">{t('health.trendRangeSummary')}</h2>
              <span className="text-[11px] text-muted">{t('health.trendRangeHint')}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCell
                label={t('health.trendAvgIntake')}
                value={summary.avgKcal === null ? '—' : formatNum(summary.avgKcal)}
                unit={summary.avgKcal === null ? '' : t('health.kcalUnit')}
                hint={
                  summary.intakeDays === 0
                    ? null
                    : t('health.trendLoggedDays', { n: summary.intakeDays })
                }
              />
              <StatCell
                label={t('health.trendAvgSleep')}
                value={avgSleepHours === null ? '—' : formatNum(avgSleepHours)}
                unit={avgSleepHours === null ? '' : t('health.trendHourUnit')}
                hint={
                  summary.sleepNights === 0
                    ? null
                    : t('health.trendLoggedNights', { n: summary.sleepNights })
                }
              />
              <StatCell
                label={t('health.trendProteinDays')}
                value={
                  summary.proteinDays === 0
                    ? '—'
                    : `${summary.proteinHitDays}/${summary.proteinDays}`
                }
                unit=""
                hint={summary.proteinDays === 0 ? null : t('health.trendDayUnit')}
              />
              <StatCell
                label={t('health.trendDerivedTdee')}
                value={derived === null ? '—' : formatNum(derived)}
                unit={derived === null ? '' : t('health.kcalUnit')}
              />
            </div>
          </section>

          {selected && (
            <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-sm font-medium text-fg">
                  {formatDate(selected.dateKey, t)}
                </h2>
                <span className="text-sm tabular-nums text-fg">
                  {formatNum(selected.weightKg)}{' '}
                  <span className="text-[11px] text-muted">{t('health.weighUnit')}</span>
                </span>
              </div>
              {previous && (
                <p className="m-0 mt-0.5 text-[11px] tabular-nums text-muted">
                  {t('health.trendVsPrev', {
                    value: `${signed(selected.weightKg - previous.weightKg)} ${t('health.weighUnit')}`,
                  })}
                </p>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {/* 当天摄入：热量与目标线，下面补三大营养素 */}
                <div className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-xs font-medium text-fg">
                      {t('health.trendIntakeTitle')}
                    </h3>
                    <Link
                      to={`/health/intakes?date=${selected.dateKey}`}
                      className="shrink-0 text-[11px] text-muted transition-colors hover:text-brand"
                    >
                      {t('health.trendOpenIntakes')} ›
                    </Link>
                  </div>
                  {intakes && intakes.length > 0 ? (
                    <>
                      <p className="m-0 mt-1 text-lg font-medium tabular-nums text-fg">
                        {formatNum(totals.kcal)}
                        <span className="ml-1 text-[11px] font-normal text-muted">
                          {t('health.kcalUnit')}
                        </span>
                      </p>
                      {targets.targetKcal ? (
                        <>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                            <div
                              className={`h-full rounded-full ${
                                totals.kcal > targets.targetKcal ? 'bg-warning' : 'bg-brand'
                              }`}
                              style={{
                                width: `${Math.min(100, (totals.kcal / targets.targetKcal) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="m-0 mt-1 text-[11px] tabular-nums text-muted">
                            {t('health.targetLine', { value: formatNum(targets.targetKcal) })}
                          </p>
                        </>
                      ) : null}
                      <p className="m-0 mt-1 text-[11px] tabular-nums text-muted">
                        {t('health.legendProtein')} {formatNum(totals.protein)} g ·{' '}
                        {t('health.legendCarbs')} {formatNum(totals.carbs)} g ·{' '}
                        {t('health.legendFat')} {formatNum(totals.fat)} g
                      </p>
                      <p className="m-0 mt-0.5 text-[11px] text-muted">
                        {t('health.itemCount', { n: intakes.length })}
                      </p>
                    </>
                  ) : (
                    <p className="m-0 mt-1 text-xs text-muted">{t('health.trendNoIntake')}</p>
                  )}
                </div>

                {/* 当天睡眠：时长、起止、夜醒；跟睡眠页同一套派生算法 */}
                <div className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="m-0 text-xs font-medium text-fg">
                      {t('health.trendSleepTitle')}
                    </h3>
                    <Link
                      to={`/health/sleeps?date=${selected.dateKey}`}
                      className="shrink-0 text-[11px] text-muted transition-colors hover:text-brand"
                    >
                      {t('health.trendOpenSleeps')} ›
                    </Link>
                  </div>
                  {sleep ? (
                    <>
                      <p className="m-0 mt-1 text-lg font-medium tabular-nums text-fg">
                        {t('health.sleepDuration', sleepPartsValue)}
                      </p>
                      <p className="m-0 mt-0.5 text-[11px] tabular-nums text-muted">
                        {sleep.bedtime} – {sleep.wakeTime}
                      </p>
                      {wakeMessage && (
                        <p className="m-0 mt-0.5 text-[11px] text-muted">
                          {t(wakeMessage.key, wakeMessage.params)}
                        </p>
                      )}
                      {sleep.quality !== null && (
                        <p className="m-0 mt-0.5 text-[11px] text-muted">
                          {t('health.sleepQuality')} {sleep.quality}/5
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="m-0 mt-1 text-xs text-muted">{t('health.trendNoSleep')}</p>
                  )}
                </div>
              </div>

              {(energyGap !== null || proteinRate !== null || sleepDelta !== null) && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {energyGap !== null && (
                    <MetricChip
                      label={t('health.trendEnergyGap')}
                      value={signed(energyGap)}
                      unit={t('health.kcalUnit')}
                    />
                  )}
                  {proteinRate !== null && (
                    <MetricChip
                      label={t('health.trendProteinRate')}
                      value={`${proteinRate}%`}
                      unit=""
                    />
                  )}
                  {sleepDelta !== null && (
                    <MetricChip
                      label={t('health.trendSleepVsIdeal')}
                      value={signed(sleepDelta)}
                      unit={t('health.trendMinuteUnit')}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {/* 记录列表兼作无障碍替代：键盘 / 读屏用户也能逐条选日期 */}
          {rangeItems.length > 0 && (
            <section className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
              <h2 className="m-0 px-3 pt-3 text-xs text-muted">{t('health.trendHistory')}</h2>
              <ul className="m-0 mt-2 list-none p-0">
                {[...rangeItems].reverse().map((item, reversedIndex) => {
                  const index = rangeItems.length - 1 - reversedIndex
                  const before = index > 0 ? rangeItems[index - 1] : null
                  const active = item.dateKey === selectedKey
                  return (
                    <li key={item.dateKey}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectDay(item.dateKey)}
                        className={`flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-xs transition-colors ${
                          active ? 'bg-brand/10' : 'hover:bg-surface-2'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate tabular-nums text-fg">
                          {formatMonthDay(item.dateKey, t)}
                        </span>
                        <span className="shrink-0 tabular-nums text-fg">
                          {formatNum(item.weightKg)} {t('health.weighUnit')}
                        </span>
                        <span className="w-16 shrink-0 text-right tabular-nums text-muted">
                          {before
                            ? `${signed(item.weightKg - before.weightKg)} ${t('health.weighUnit')}`
                            : '—'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
