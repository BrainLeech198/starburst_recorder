import { useState } from 'react'
import { Link } from 'react-router'
import type { HealthMeasurement } from '@/core/db/schema'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import BackButton from '@/shared/ui/BackButton'
import { NAV_BACK_BUTTON } from '@/shared/ui/buttonStyles'
import { healthProfile, measurementOfDay, measurementsBetween, saveHealthMeasurement } from './healthRepo'

const FIELDS = [
  { key: 'waistCm', label: 'health.waistLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'abdomenCm', label: 'health.abdomenLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'chestCm', label: 'health.chestLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'upperArmCm', label: 'health.upperArmLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'thighCm', label: 'health.thighLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'calfCm', label: 'health.calfLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'neckCm', label: 'health.neckLabel', unit: 'cm', min: 20, max: 250 },
  { key: 'bodyFatPct', label: 'health.bodyFatMeasuredLabel', unit: '%', min: 1, max: 75 },
] as const

type MeasurementKey = (typeof FIELDS)[number]['key']
type Draft = Partial<Record<MeasurementKey, string>>

function measurementValue(row: HealthMeasurement | undefined, key: MeasurementKey): number | null {
  return row?.[key] ?? null
}

export default function MeasurementsPage() {
  const { t } = useI18n()
  const [dateKey, setDateKey] = useState(todayKey())
  const [draft, setDraft] = useState<Draft>({})
  const [trendKey, setTrendKey] = useState<MeasurementKey>('waistCm')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const current = useLiveQuery(() => measurementOfDay(dateKey), [dateKey])
  const profile = useLiveQuery(() => healthProfile(), [])
  const rows = useLiveQuery(() => measurementsBetween('0000-01-01', '9999-12-31'), []) ?? []
  const weightPoints = (profile?.weighIns ?? [])
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-12)
  const weightMin = weightPoints.length ? Math.min(...weightPoints.map((point) => point.weightKg)) : 0
  const weightSpan = Math.max(
    (weightPoints.length ? Math.max(...weightPoints.map((point) => point.weightKg)) : 0) - weightMin,
    1,
  )
  const weightCoordinates = weightPoints.map((point, index) => {
    const x = weightPoints.length < 2 ? 50 : 8 + (84 * index) / (weightPoints.length - 1)
    const y = 82 - ((point.weightKg - weightMin) / weightSpan) * 64
    return `${x},${y}`
  })
  const field = FIELDS.find((item) => item.key === trendKey) ?? FIELDS[0]
  const points = rows
    .map((row) => ({ row, value: measurementValue(row, trendKey) }))
    .filter((point): point is { row: HealthMeasurement; value: number } => point.value !== null)
    .slice(-12)
  const min = points.length ? Math.min(...points.map((point) => point.value)) : 0
  const max = points.length ? Math.max(...points.map((point) => point.value)) : 0
  const span = Math.max(max - min, 1)
  const coordinates = points.map((point, index) => {
    const x = points.length < 2 ? 50 : 8 + (84 * index) / (points.length - 1)
    const y = 82 - ((point.value - min) / span) * 64
    return `${x},${y}`
  })
  const displayValue = (key: MeasurementKey) =>
    Object.prototype.hasOwnProperty.call(draft, key)
      ? draft[key] ?? ''
      : String(measurementValue(current, key) ?? '')
  const values = FIELDS.map((item) => {
    const raw = displayValue(item.key).trim()
    if (raw === '') return [item.key, null] as const
    const value = Number(raw)
    return [item.key, Number.isFinite(value) && value >= item.min && value <= item.max
      ? Math.round(value * 10) / 10
      : undefined] as const
  })
  const hasInvalid = values.some(([, value]) => value === undefined)
  const hasAnyValue = values.some(([, value]) => typeof value === 'number')
  const waist = values.find(([key]) => key === 'waistCm')?.[1]
  const ratio = typeof waist === 'number' && profile?.heightCm && profile.heightCm > 0
    ? waist / profile.heightCm
    : null

  async function save() {
    if (!isDateKey(dateKey) || hasInvalid || !hasAnyValue) return
    const now = Date.now()
    const record = Object.fromEntries(FIELDS.map((item) => [
      item.key,
      values.find(([key]) => key === item.key)?.[1] ?? null,
    ])) as Pick<HealthMeasurement, MeasurementKey>
    await saveHealthMeasurement({
      dateKey,
      ...record,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setDraft({})
    setSavedAt(now)
  }

  return (
    <div className="w-full p-4">
      <header className="flex items-center gap-2">
        <BackButton to="/health" label={t('nav.health')} icon className={`${NAV_BACK_BUTTON} gap-1`} />
        <h1 className="m-0 text-base font-medium text-fg">{t('health.measurementsTitle')}</h1>
      </header>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <p className="m-0 text-sm text-muted">{t('health.measurementIntro')}</p>
        <label className="mt-4 block text-xs text-muted" htmlFor="measurement-date">
          {t('health.measurementDate')}
        </label>
        <input
          id="measurement-date"
          type="date"
          value={dateKey}
          onChange={(event) => {
            setDateKey(event.currentTarget.value)
            setDraft({})
            setSavedAt(null)
          }}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg"
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {FIELDS.map((item) => (
            <label key={item.key} className="block text-xs text-muted">
              {t(item.label)}
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={item.min}
                  max={item.max}
                  step="0.1"
                  inputMode="decimal"
                  value={displayValue(item.key)}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, [item.key]: event.currentTarget.value }))
                    setSavedAt(null)
                  }}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm tabular-nums text-fg"
                />
                <span>{item.unit}</span>
              </span>
            </label>
          ))}
        </div>
        {ratio !== null && (
          <p className="m-0 mt-3 text-xs text-muted">
            {t('health.waistHeightRatio', { ratio: ratio.toFixed(2) })}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="m-0 min-h-4 text-xs text-muted" aria-live="polite">
            {savedAt ? t('health.measurementSaved') : current ? t('health.measurementOverwriteHint') : ''}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDateKey(dateKey) || hasInvalid || !hasAnyValue}
            className="h-10 shrink-0 rounded-xl bg-brand px-4 text-sm text-white disabled:opacity-40"
          >
            {t('health.measurementSave')}
          </button>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-medium text-fg">{t('health.measurementTrend')}</h2>
          <select
            value={trendKey}
            onChange={(event) => setTrendKey(event.currentTarget.value as MeasurementKey)}
            className="h-9 rounded-xl border border-line bg-surface-2 px-2 text-xs text-fg"
          >
            {FIELDS.map((item) => <option key={item.key} value={item.key}>{t(item.label)}</option>)}
          </select>
        </div>
        {points.length === 0 ? (
          <p className="m-0 mt-4 py-6 text-center text-sm text-muted">{t('health.measurementEmpty')}</p>
        ) : (
          <>
            {points.length > 1 && (
              <svg viewBox="0 0 100 100" role="img" aria-label={t('health.measurementTrend')} className="mt-3 h-36 w-full overflow-visible">
                <polyline points={coordinates.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand" />
                {coordinates.map((point, index) => {
                  const [cx, cy] = point.split(',')
                  return <circle key={points[index].row.dateKey} cx={cx} cy={cy} r="2.2" fill="currentColor" className="text-brand" />
                })}
              </svg>
            )}
            <ol className="m-0 mt-2 list-none divide-y divide-line p-0">
              {[...points].reverse().map(({ row, value }) => (
                <li key={row.dateKey} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{formatDate(row.dateKey, t)}</span>
                  <span className="tabular-nums text-fg">{value} {field.unit}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-medium text-fg">{t('health.trendPageTitle')}</h2>
          <Link to="/health/weights/trend" className="text-xs text-brand">{t('health.viewRecords')}</Link>
        </div>
        {weightPoints.length === 0 ? (
          <p className="m-0 mt-4 py-6 text-center text-sm text-muted">{t('health.derivedInsufficient')}</p>
        ) : (
          <>
            {weightPoints.length > 1 && (
              <svg viewBox="0 0 100 100" role="img" aria-label={t('health.trendPageTitle')} className="mt-3 h-36 w-full overflow-visible">
                <polyline points={weightCoordinates.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand" />
                {weightCoordinates.map((point, index) => {
                  const [cx, cy] = point.split(',')
                  return <circle key={weightPoints[index].dateKey} cx={cx} cy={cy} r="2.2" fill="currentColor" className="text-brand" />
                })}
              </svg>
            )}
            <ol className="m-0 mt-2 list-none divide-y divide-line p-0">
              {[...weightPoints].reverse().slice(0, 5).map((point) => (
                <li key={point.dateKey} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{formatDate(point.dateKey, t)}</span>
                  <span className="tabular-nums text-fg">{point.weightKg} {t('health.weighUnit')}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      </div>
      <p className="mt-3 text-center text-xs text-muted">{t('health.measurementDataNote')}</p>
      <Link to="/health/weights" className="mt-3 block text-center text-xs text-brand">
        {t('health.measurementWeightsLink')}
      </Link>
    </div>
  )
}
