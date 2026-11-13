import type { AssistantDataSource } from '@/core/db/store'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { formatDate, formatMonthDay } from '@/core/utils/dateKey'
import {
  napMinutes,
  sleepMinutes,
  sleepParts,
  sleepWakeStats,
} from '@/features/health/sleepMath'
import { useI18n } from '@/shared/i18n/context'
import type { ReactNode } from 'react'
import { reportTotals, reportTrendPoints } from './aiReport'
import type { ReportPeriod, ReportTrendPoint } from './aiReport'

type ReportBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered'; items: string[] }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'heading'; text: string }

interface ReportSection {
  title: string
  lines: string[]
}

function sectionsOf(content: string): ReportSection[] {
  const sections: ReportSection[] = []
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      sections.push({ title: heading[1].trim(), lines: [] })
    } else if (sections.length === 0) {
      sections.push({ title: '', lines: [line] })
    } else {
      sections[sections.length - 1].lines.push(line)
    }
  }
  return sections
}

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function blocksOf(lines: string[]): ReportBlock[] {
  const blocks: ReportBlock[] = []
  let paragraph: string[] = []
  let listKind: 'unordered' | 'ordered' | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (listKind && listItems.length > 0) blocks.push({ kind: listKind, items: listItems })
    listKind = null
    listItems = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    if (/^\|.*\|$/.test(line)) {
      flushParagraph()
      flushList()
      const rows: string[][] = []
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        const row = lines[index].trim()
        if (!isTableDivider(row)) rows.push(cellsOf(row))
        index += 1
      }
      index -= 1
      if (rows.length > 0) blocks.push({ kind: 'table', rows })
      continue
    }
    const subheading = line.match(/^###\s+(.+)$/)
    if (subheading) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', text: subheading[1] })
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const numbered = line.match(/^\d+[.)、]\s+(.+)$/)
    if (bullet || numbered) {
      flushParagraph()
      const nextKind = bullet ? 'unordered' : 'ordered'
      if (listKind && listKind !== nextKind) flushList()
      listKind = nextKind
      listItems.push((bullet ?? numbered)![1])
      continue
    }
    if (listKind) flushList()
    paragraph.push(line.replace(/^>\s?/, ''))
  }
  flushParagraph()
  flushList()
  return blocks
}

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

function MarkdownBlocks({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-3 text-sm leading-7 text-slate-700">
      {blocksOf(lines).map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={index} className="m-0">
              {inlineText(block.text)}
            </p>
          )
        }
        if (block.kind === 'heading') {
          return (
            <h3 key={index} className="mb-0 mt-5 text-sm font-semibold text-slate-900">
              {inlineText(block.text)}
            </h3>
          )
        }
        if (block.kind === 'unordered' || block.kind === 'ordered') {
          const List = block.kind === 'unordered' ? 'ul' : 'ol'
          return (
            <List
              key={index}
              className={
                block.kind === 'unordered'
                  ? 'm-0 list-disc space-y-1 pl-5'
                  : 'm-0 list-decimal space-y-1 pl-5'
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inlineText(item)}</li>
              ))}
            </List>
          )
        }
        const [header, ...body] = block.rows
        return (
          <div key={index} className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
              {header && (
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {header.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="border-b border-slate-200 px-3 py-2 font-medium"
                      >
                        {inlineText(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-slate-100 px-3 py-2 align-top"
                      >
                        {inlineText(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200/70">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold leading-tight text-slate-900">{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-slate-500">{note}</div>
    </div>
  )
}

function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 sm:p-4">
      <h2 className="m-0 border-l-4 border-blue-600 pl-2 text-sm font-semibold text-slate-900">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {headers.map((header, index) => (
              <th key={index} className="border-b border-slate-200 px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="max-w-[15rem] border-b border-slate-100 px-3 py-2 align-top text-slate-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendChart({
  title,
  unit,
  color,
  points,
  valueOf,
  period,
}: {
  title: string
  unit: string
  color: string
  points: ReportTrendPoint[]
  valueOf: (point: ReportTrendPoint) => number
  period: ReportPeriod
}) {
  const { t } = useI18n()
  const max = Math.max(1, ...points.map(valueOf))
  const labelStride = Math.max(1, Math.ceil(points.length / 8))
  const minWidth = points.length > 14 ? `${points.length * 20}px` : '100%'

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-xs font-semibold text-slate-800">{title}</h3>
        <span className="text-[10px] text-slate-400">{unit}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="flex h-32 items-end gap-1 px-1" style={{ minWidth }}>
          {points.map((point, index) => {
            const value = valueOf(point)
            const height = value > 0 ? Math.max(4, (value / max) * 100) : 0
            const month = Number(point.key.slice(5, 7))
            const day = Number(point.key.slice(8, 10))
            const label = period.kind === 'year' ? String(month) : String(day)
            const fullLabel = t('date.full', {
              year: Number(point.key.slice(0, 4)),
              month,
              day,
            })
            const showLabel = index % labelStride === 0 || index === points.length - 1
            return (
              <div
                key={point.key}
                className="flex h-full min-w-[14px] flex-1 flex-col items-center justify-end"
              >
                <div className="flex h-24 w-full items-end">
                  <div
                    title={`${fullLabel} · ${Math.round(value)} ${unit}`}
                    className="w-full rounded-t-sm transition-[height]"
                    style={{ height: `${height}%`, backgroundColor: color }}
                  />
                </div>
                <span className="h-5 pt-1 text-[9px] leading-3 text-slate-400">
                  {showLabel ? label : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function SourceBars({
  title,
  rows,
  unit,
}: {
  title: string
  rows: Array<{ name: string; value: number }>
  unit: string
}) {
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <DataPanel title={title}>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-700">{row.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {Math.round(row.value)} {unit}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </DataPanel>
  )
}

export default function AiReportPreview({
  content,
  data,
  period,
  title,
}: {
  content: string
  data: AssistantDataSource
  period: ReportPeriod
  title: string
}) {
  const { t } = useI18n()
  const totals = reportTotals(data, period)
  const points = reportTrendPoints(data, period)
  const sections = sectionsOf(content)
  const inPeriod = (dateKey: string) => dateKey >= period.from && dateKey <= period.to
  const intakes = data.intakes
    .filter((item) => item.deletedAt === null && inPeriod(item.dateKey))
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time))
  const trainings = data.trainings
    .filter((item) => item.deletedAt === null && inPeriod(item.dateKey))
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time))
  const sleeps = data.sleeps
    .filter((item) => item.deletedAt === null && inPeriod(item.dateKey))
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const detailedPeriod = period.kind === 'day' || period.kind === 'week'
  const showDate = period.kind === 'week'
  const averageKcal = totals.intakeDays > 0 ? Math.round(totals.kcal / totals.intakeDays) : null
  const averageProtein = totals.intakeDays > 0 ? Math.round(totals.protein / totals.intakeDays) : null
  const sleep = totals.sleepNights > 0 ? sleepParts(totals.sleepMinutes / totals.sleepNights) : null
  const macroEnergy = {
    protein: totals.protein * 4,
    carbs: totals.carbs * 4,
    fat: totals.fat * 9,
  }
  const totalMacroEnergy = macroEnergy.protein + macroEnergy.carbs + macroEnergy.fat
  const calorieTarget = data.profile?.targetKcal ?? null
  const tdee = data.profile?.tdee ?? null
  const scaleMax = Math.max(1, averageKcal ?? 0, calorieTarget ?? 0, tdee ?? 0)
  const chartSegments = [
    { name: 'protein', value: macroEnergy.protein, color: '#2563eb', label: t('ai.reportProteinShort') },
    { name: 'carbs', value: macroEnergy.carbs, color: '#d97706', label: t('ai.reportCarbs') },
    { name: 'fat', value: macroEnergy.fat, color: '#e11d48', label: t('ai.reportFat') },
  ]
  const mealSegments = [
    {
      name: 'breakfast' as const,
      value: totals.mealKcalBuckets.breakfast,
      count: totals.mealBuckets.breakfast,
      label: t('ai.reportMealBreakfast'),
      color: '#d97706',
    },
    {
      name: 'lunch' as const,
      value: totals.mealKcalBuckets.lunch,
      count: totals.mealBuckets.lunch,
      label: t('ai.reportMealLunch'),
      color: '#2563eb',
    },
    {
      name: 'dinner' as const,
      value: totals.mealKcalBuckets.dinner,
      count: totals.mealBuckets.dinner,
      label: t('ai.reportMealDinner'),
      color: '#16a34a',
    },
    {
      name: 'other' as const,
      value: totals.mealKcalBuckets.other,
      count: totals.mealBuckets.other,
      label: t('ai.reportMealOther'),
      color: '#94a3b8',
    },
  ]
  const mealKcalTotal = mealSegments.reduce((sum, segment) => sum + segment.value, 0)
  const dateCell = (dateKey: string) =>
    showDate ? formatMonthDay(dateKey, t) : formatDate(dateKey, t)
  const lastWeight = totals.weights.at(-1)

  return (
    <article className="mx-auto w-full max-w-3xl rounded-2xl bg-[#f6f7f9] p-3 text-[#1a1d21] sm:p-5">
      <header className="px-1 pb-2">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
          {period.label}
        </p>
        <h1 className="m-0 mt-1 text-xl font-bold sm:text-2xl">{title}</h1>
      </header>

      <DataPanel title={t('ai.reportOverview')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label={t('ai.reportCaloriesLabel')}
            value={averageKcal === null ? '—' : `${averageKcal}`}
            note={
              averageKcal === null
                ? t('review.intake')
                : t('ai.reportIntakeStats', {
                    total: Math.round(totals.kcal),
                    days: totals.intakeDays,
                  })
            }
          />
          <StatCard
            label={t('ai.reportProteinLabel')}
            value={averageProtein === null ? '—' : `${averageProtein} g`}
            note={
              averageProtein === null
                ? t('review.intake')
                : t('ai.reportProteinStats', { total: Math.round(totals.protein) })
            }
          />
          <StatCard
            label={t('review.training')}
            value={`${totals.trainingSessions}`}
            note={t('review.trainingValue', {
              n: totals.trainingSessions,
              m: totals.trainingMinutes,
            })}
          />
          <StatCard
            label={t('review.avgSleep')}
            value={sleep === null ? '—' : t('health.sleepDuration', { h: sleep.h, m: sleep.m })}
            note={t('review.sleepNights', { n: totals.sleepNights })}
          />
        </div>
        {(averageKcal !== null && (calorieTarget !== null || tdee !== null)) && (
          <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200/70">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {tdee !== null && <span>{t('health.tdeeLine', { value: Math.round(tdee) })}</span>}
              {calorieTarget !== null && (
                <span>{t('health.targetLine', { value: Math.round(calorieTarget) })}</span>
              )}
              <span>{t('ai.reportCaloriesLabel')}: {averageKcal}</span>
            </div>
            <div className="relative mt-2 h-2 overflow-visible rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.min(100, (averageKcal / scaleMax) * 100)}%` }}
              />
              {tdee !== null && (
                <span
                  className="absolute top-[-3px] h-3.5 w-0.5 bg-slate-700"
                  style={{ left: `${Math.min(100, (tdee / scaleMax) * 100)}%` }}
                />
              )}
              {calorieTarget !== null && (
                <span
                  className="absolute top-[-3px] h-3.5 w-0.5 bg-amber-500"
                  style={{ left: `${Math.min(100, (calorieTarget / scaleMax) * 100)}%` }}
                />
              )}
            </div>
          </div>
        )}
      </DataPanel>

      {totals.intakes > 0 && (
        <DataPanel title={t('ai.reportIntakeTrend')}>
          <div className="grid gap-2 sm:grid-cols-2">
            <TrendChart
              title={t('ai.reportCaloriesLabel')}
              unit="kcal"
              color="#2563eb"
              points={points}
              valueOf={(point) => point.kcal}
              period={period}
            />
            <TrendChart
              title={t('ai.reportProteinLabel')}
              unit="g"
              color="#16a34a"
              points={points}
              valueOf={(point) => point.protein}
              period={period}
            />
          </div>
        </DataPanel>
      )}

      {totalMacroEnergy > 0 && (
        <DataPanel title={t('ai.reportMacroStructure')}>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-slate-100"
            aria-label={t('ai.reportMacroStructure')}
          >
            {chartSegments.map((segment) => (
              <span
                key={segment.name}
                style={{
                  width: `${(segment.value / totalMacroEnergy) * 100}%`,
                  backgroundColor: segment.color,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
            {chartSegments.map((segment) => (
              <span key={segment.name}>
                <i
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                {segment.label} {Math.round((segment.value / totalMacroEnergy) * 100)}%
              </span>
            ))}
          </div>
        </DataPanel>
      )}

      {totals.intakes > 0 && totals.firstMeal && totals.lastMeal && (
        <DataPanel title={t('ai.reportEatingWindow')}>
          <p className="m-0 text-sm text-slate-700">
            {totals.firstMeal} – {totals.lastMeal}
          </p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {mealSegments.map((segment) => (
              <span
                key={segment.name}
                style={{
                  width: mealKcalTotal > 0 ? `${(segment.value / mealKcalTotal) * 100}%` : '0%',
                  backgroundColor: segment.color,
                }}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-4">
            {mealSegments.map((segment) => (
              <span key={segment.name} className="flex min-w-0 items-baseline gap-1">
                <i
                  className="mr-0.5 inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="truncate">{segment.label}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {Math.round(segment.value)} kcal · {segment.count} {t('health.unitIntake')}
                </span>
              </span>
            ))}
          </div>
          <p className="mb-0 mt-2 text-[10px] text-slate-400">{t('ai.reportMealGroupingHint')}</p>
        </DataPanel>
      )}

      {detailedPeriod && intakes.length > 0 && (
        <DataPanel title={t('ai.reportMealDetails')}>
          <DataTable
            headers={[
              ...(showDate ? [t('ai.reportDate')] : []),
              t('intake.time'),
              t('foods.name'),
              t('foods.kcal'),
              t('foods.protein'),
            ]}
            rows={intakes.map((item) => [
              ...(showDate ? [dateCell(item.dateKey)] : []),
              item.time.slice(0, 5),
              `${item.name} · ${item.grams} g`,
              Math.round(item.kcal),
              `${Math.round(item.protein * 10) / 10} g`,
            ])}
          />
          <div className="mt-2 text-right text-[11px] font-medium tabular-nums text-slate-600">
            {t('health.detailTotal')}: {Math.round(totals.kcal)} kcal · {Math.round(totals.protein * 10) / 10} g
          </div>
        </DataPanel>
      )}

      {totals.proteinSources.length > 0 && (
        <SourceBars
          title={t('ai.reportProteinSources')}
          rows={totals.proteinSources.map((row) => ({ name: row.name, value: row.protein }))}
          unit="g"
        />
      )}
      {totals.foodSources.length > 0 && (
        <SourceBars
          title={t('ai.reportFoodSources')}
          rows={totals.foodSources.map((row) => ({ name: row.name, value: row.kcal }))}
          unit="kcal"
        />
      )}

      {detailedPeriod && trainings.length > 0 && (
        <DataPanel title={t('training.title')}>
          <DataTable
            headers={[
              ...(showDate ? [t('ai.reportDate')] : []),
              t('intake.time'),
              t('training.titleField'),
              t('training.kindLabel'),
              t('training.durationMin'),
              t('ai.reportActivityDetails'),
            ]}
            rows={trainings.map((item) => {
              const kindKey = `training.kind.${item.kind}` as MessageKey
              return [
                ...(showDate ? [dateCell(item.dateKey)] : []),
                item.time,
                item.title || '—',
                t(kindKey),
                item.durationMin === null ? '—' : item.durationMin,
                item.exercises
                  .map((exercise) => `${exercise.name} (${exercise.sets.length} ${t('training.sets')})`)
                  .join('、') || '—',
              ]
            })}
          />
        </DataPanel>
      )}

      {detailedPeriod && sleeps.length > 0 && (
        <DataPanel title={t('health.sleepTitle')}>
          <DataTable
            headers={[
              ...(showDate ? [t('ai.reportDate')] : []),
              t('health.sleepBedtime'),
              t('health.sleepWake'),
              t('ai.reportDuration'),
              t('health.sleepQuality'),
              t('health.sleepWakeCount'),
            ]}
            rows={sleeps.map((item) => {
              const duration = sleepParts(sleepMinutes(item.bedtime, item.wakeTime))
              const wake = sleepWakeStats(item)
              const naps = (item.naps ?? []).reduce((sum, nap) => sum + napMinutes(nap), 0)
              return [
                ...(showDate ? [dateCell(item.dateKey)] : []),
                item.bedtime,
                item.wakeTime,
                t('health.sleepDuration', duration),
                item.quality === null ? '—' : `${item.quality}/5`,
                `${wake.count === null ? '—' : wake.count}${naps > 0 ? ` · ${t('health.sleepNaps')} ${naps} min` : ''}`,
              ]
            })}
          />
        </DataPanel>
      )}

      {totals.weights.length > 0 && (
        <DataPanel title={t('ai.reportWeightTrend')}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-700">
            {totals.weights.map((row, index) => (
              <span key={`${row.dateKey}-${index}`} className="tabular-nums">
                {formatMonthDay(row.dateKey, t)} · {row.kg.toFixed(1)} kg
                {index < totals.weights.length - 1 && <span className="ml-3 text-slate-300">→</span>}
              </span>
            ))}
          </div>
          {totals.weights.length > 1 && lastWeight && (
            <p className="mb-0 mt-2 text-xs text-slate-500">
              {formatDate(lastWeight.dateKey, t)} · {lastWeight.kg.toFixed(1)} kg
            </p>
          )}
        </DataPanel>
      )}

      {totals.scheduleTotal > 0 && (
        <DataPanel title={t('review.schedules')}>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${(totals.scheduleDone / totals.scheduleTotal) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-slate-600">
              {totals.scheduleDone}/{totals.scheduleTotal}
            </span>
          </div>
        </DataPanel>
      )}

      <div className="mt-4 space-y-3">
        {sections.map((section, index) => {
          const caution = /风险|身体信号|留意/.test(section.title)
          const action = /下一|建议|行动/.test(section.title)
          const tone = caution
            ? 'border-amber-200 bg-amber-50'
            : action
              ? 'border-blue-200 bg-blue-50'
              : 'border-slate-200 bg-white'
          return (
            <section key={`${section.title}-${index}`} className={`rounded-xl border p-4 shadow-sm ${tone}`}>
              {section.title && (
                <h2 className="mb-3 mt-0 border-l-4 border-blue-600 pl-2 text-base font-semibold text-slate-900">
                  {section.title}
                </h2>
              )}
              <MarkdownBlocks lines={section.lines} />
            </section>
          )
        })}
      </div>
      <footer className="px-1 pb-1 pt-4 text-center text-[10px] text-slate-400">
        {t('ai.reportHint')}
      </footer>
    </article>
  )
}
