import { useMemo } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, shiftDay, todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import type { HealthIntake, HealthMeasurement, HealthSleep, HealthTraining } from '@/core/db/schema'
import BackButton from '@/shared/ui/BackButton'
import { NAV_BACK_BUTTON } from '@/shared/ui/buttonStyles'
import { formatNum } from './healthMath'
import { averageBedtimeOffset, nutritionByTrainingRecord, recordCoverage } from './healthInsights'
import { healthProfile, intakesBetween, measurementsBetween, sleepsBetween } from './healthRepo'
import { trainingsBetween } from '@/features/training/trainingRepo'

const EMPTY_INTAKES: HealthIntake[] = []
const EMPTY_SLEEPS: HealthSleep[] = []
const EMPTY_TRAININGS: HealthTraining[] = []
const EMPTY_MEASUREMENTS: HealthMeasurement[] = []

export default function InsightsPage() {
  const { t } = useI18n()
  const to = todayKey()
  const from = shiftDay(to, -29)
  const profile = useLiveQuery(() => healthProfile(), [])
  const intakes = useLiveQuery(() => intakesBetween(from, to), [from, to]) ?? EMPTY_INTAKES
  const sleeps = useLiveQuery(() => sleepsBetween(from, to), [from, to]) ?? EMPTY_SLEEPS
  const trainings = useLiveQuery(() => trainingsBetween(from, to), [from, to]) ?? EMPTY_TRAININGS
  const measurements = useLiveQuery(() => measurementsBetween(from, to), [from, to]) ?? EMPTY_MEASUREMENTS
  const nutrition = useMemo(() => nutritionByTrainingRecord(intakes, trainings), [intakes, trainings])
  const sleepOffset = useMemo(
    () => averageBedtimeOffset(sleeps, profile?.idealBedtime ?? ''),
    [sleeps, profile?.idealBedtime],
  )
  const coverage = useMemo(() => recordCoverage({
    from,
    to,
    intakes,
    sleeps,
    trainings,
    measurements,
    weighIns: profile?.weighIns ?? [],
  }), [from, to, intakes, sleeps, trainings, measurements, profile?.weighIns])

  const proteinDays = new Map<string, number>()
  for (const intake of intakes) {
    proteinDays.set(intake.dateKey, (proteinDays.get(intake.dateKey) ?? 0) + intake.protein)
  }
  const averageProtein = proteinDays.size
    ? [...proteinDays.values()].reduce((total, grams) => total + grams, 0) / proteinDays.size
    : null
  const latestWeight = profile?.weighIns?.slice().sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0]?.weightKg
    ?? profile?.weightKg
    ?? null
  const proteinPerKg = averageProtein !== null && latestWeight !== null && latestWeight > 0
    ? averageProtein / latestWeight
    : null
  const offsetMinutes = sleepOffset.averageMinutes
  const offsetText = offsetMinutes === null
    ? null
    : `${offsetMinutes > 0 ? '+' : offsetMinutes < 0 ? '−' : ''}${Math.floor(Math.abs(offsetMinutes) / 60)}h ${Math.round(Math.abs(offsetMinutes) % 60)}m`

  function nutritionText(days: number, kcal: number | null, protein: number | null) {
    return days === 0
      ? t('health.insightsNoData')
      : t('health.insightsNutritionAverage', {
          days,
          kcal: formatNum(kcal),
          protein: formatNum(protein),
        })
  }

  return (
    <div className="w-full p-4">
      <header className="flex items-center gap-2">
        <BackButton to="/health" label={t('nav.health')} icon className={`${NAV_BACK_BUTTON} gap-1`} />
        <h1 className="m-0 text-base font-medium text-fg">{t('health.insightsTitle')}</h1>
      </header>
      <p className="mb-0 mt-2 text-xs text-muted">{t('health.insightsRange', { from: formatDate(from, t), to: formatDate(to, t) })}</p>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.insightsProteinPerKg')}</h2>
        {proteinPerKg === null ? (
          <p className="m-0 mt-2 text-sm text-muted">{t('health.insightsNoData')}</p>
        ) : (
          <p className="m-0 mt-2 text-2xl font-medium tabular-nums text-fg">
            {formatNum(proteinPerKg)} <span className="text-xs font-normal text-muted">g/kg</span>
          </p>
        )}
        <p className="m-0 mt-1 text-xs text-muted">
          {t('health.insightsProteinContext', {
            days: proteinDays.size,
            protein: formatNum(averageProtein),
            weight: formatNum(latestWeight),
          })}
        </p>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.insightsTrainingNutrition')}</h2>
        <p className="m-0 mt-3 text-xs font-medium text-muted">{t('health.insightsTrainingDays')}</p>
        <p className="m-0 mt-1 text-sm text-fg">{nutritionText(nutrition.training.recordedDays, nutrition.training.averageKcal, nutrition.training.averageProtein)}</p>
        <p className="m-0 mt-3 text-xs font-medium text-muted">{t('health.insightsNoTrainingRecordDays')}</p>
        <p className="m-0 mt-1 text-sm text-fg">{nutritionText(nutrition.noTrainingRecord.recordedDays, nutrition.noTrainingRecord.averageKcal, nutrition.noTrainingRecord.averageProtein)}</p>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.insightsBedtime')}</h2>
        <p className="m-0 mt-2 text-2xl font-medium tabular-nums text-fg">
          {offsetText ?? t('health.insightsNoData')}
        </p>
        <p className="m-0 mt-1 text-xs text-muted">
          {t('health.insightsBedtimeContext', { nights: sleepOffset.sampleNights })}
        </p>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.insightsCoverage')}</h2>
        <p className="m-0 mt-1 text-xs text-muted">{t('health.insightsCoverageContext', { days: coverage.totalDays })}</p>
        <ul className="m-0 mt-3 list-none divide-y divide-line p-0">
          {[
            ['health.insightsIntakeCoverage', coverage.intakeDays],
            ['health.insightsSleepCoverage', coverage.sleepDays],
            ['health.insightsTrainingCoverage', coverage.trainingDays],
            ['health.insightsWeightCoverage', coverage.weightDays],
            ['health.insightsMeasurementCoverage', coverage.measurementDays],
          ].map(([key, days]) => (
            <li key={key} className="flex items-center justify-between py-2 text-sm">
              <span className="text-muted">{t(key as MessageKey)}</span>
              <span className="tabular-nums text-fg">{days} / {coverage.totalDays}</span>
            </li>
          ))}
        </ul>
      </section>

      <Link to="/health/goals" className="mt-3 block text-center text-xs text-brand">{t('health.goalsTitle')}</Link>
    </div>
  )
}
