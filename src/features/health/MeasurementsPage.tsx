import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, isDateKey, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import BackButton from '@/shared/ui/BackButton'
import { NAV_BACK_BUTTON } from '@/shared/ui/buttonStyles'
import { measurementOfDay, measurementsBetween, saveHealthMeasurement } from './healthRepo'

export default function MeasurementsPage() {
  const { t } = useI18n()
  const [dateKey, setDateKey] = useState(todayKey())
  const [value, setValue] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const current = useLiveQuery(() => measurementOfDay(dateKey), [dateKey])
  const rows = useLiveQuery(() => measurementsBetween('0000-01-01', '9999-12-31'), []) ?? []
  const displayedValue = value !== '' ? value : current ? String(current.waistCm) : ''
  const points = rows.slice(-12)
  const min = points.length ? Math.min(...points.map((item) => item.waistCm)) : 0
  const max = points.length ? Math.max(...points.map((item) => item.waistCm)) : 0
  const span = Math.max(max - min, 1)
  const coordinates = points.map((item, index) => {
    const x = points.length < 2 ? 50 : 8 + (84 * index) / (points.length - 1)
    const y = 82 - ((item.waistCm - min) / span) * 64
    return `${x},${y}`
  })

  async function save() {
    const waistCm = Number(displayedValue)
    if (!isDateKey(dateKey) || !Number.isFinite(waistCm) || waistCm < 20 || waistCm > 250) return
    const now = Date.now()
    await saveHealthMeasurement({
      dateKey,
      waistCm: Math.round(waistCm * 10) / 10,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    setValue('')
    setSavedAt(now)
  }

  return (
    <div className="w-full p-4">
      <header className="flex items-center gap-2">
        <BackButton to="/health" label={t('nav.health')} icon className={`${NAV_BACK_BUTTON} gap-1`} />
        <h1 className="m-0 text-base font-medium text-fg">{t('health.measurementsTitle')}</h1>
      </header>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <p className="m-0 text-sm text-muted">{t('health.waistIntro')}</p>
        <label className="mt-4 block text-xs text-muted" htmlFor="measurement-date">
          {t('health.measurementDate')}
        </label>
        <input
          id="measurement-date"
          type="date"
          value={dateKey}
          onChange={(event) => {
            setDateKey(event.currentTarget.value)
            setValue('')
          }}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg"
        />
        <label className="mt-3 block text-xs text-muted" htmlFor="waist-cm">
          {t('health.waistLabel')}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="waist-cm"
            type="number"
            min="20"
            max="250"
            step="0.1"
            inputMode="decimal"
            value={displayedValue}
            onChange={(event) => {
              setValue(event.currentTarget.value)
              setSavedAt(null)
            }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm tabular-nums text-fg"
          />
          <span className="text-sm text-muted">cm</span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDateKey(dateKey) || !Number.isFinite(Number(displayedValue)) || Number(displayedValue) < 20 || Number(displayedValue) > 250}
            className="h-10 rounded-xl bg-brand px-4 text-sm text-white disabled:opacity-40"
          >
            {t('health.measurementSave')}
          </button>
        </div>
        <p className="m-0 mt-2 min-h-4 text-xs text-muted" aria-live="polite">
          {savedAt ? t('health.measurementSaved') : current ? t('health.measurementOverwriteHint') : ''}
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.waistTrend')}</h2>
        {points.length === 0 ? (
          <p className="m-0 mt-4 py-6 text-center text-sm text-muted">{t('health.measurementEmpty')}</p>
        ) : (
          <>
            {points.length > 1 ? (
              <svg viewBox="0 0 100 100" role="img" aria-label={t('health.waistTrend')} className="mt-3 h-36 w-full overflow-visible">
                <polyline points={coordinates.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand" />
                {coordinates.map((point, index) => {
                  const [cx, cy] = point.split(',')
                  return <circle key={points[index].dateKey} cx={cx} cy={cy} r="2.2" fill="currentColor" className="text-brand" />
                })}
              </svg>
            ) : null}
            <ol className="m-0 mt-2 list-none divide-y divide-line p-0">
              {[...points].reverse().map((item) => (
                <li key={item.dateKey} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{formatDate(item.dateKey, t)}</span>
                  <span className="tabular-nums text-fg">{item.waistCm} cm</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <p className="mt-3 text-center text-xs text-muted">{t('health.measurementDataNote')}</p>
      <Link to="/health/weights" className="mt-3 block text-center text-xs text-brand">
        {t('health.measurementWeightsLink')}
      </Link>
    </div>
  )
}
