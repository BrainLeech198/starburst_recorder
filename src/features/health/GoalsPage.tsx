import { useState } from 'react'
import type { HealthGoal, HealthGoalType } from '@/core/db/schema'
import { newId } from '@/core/utils/id'
import { todayKey } from '@/core/utils/dateKey'
import { useLiveQuery } from '@/core/db/live'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import BackButton from '@/shared/ui/BackButton'
import { NAV_BACK_BUTTON } from '@/shared/ui/buttonStyles'
import { emptyProfile } from './healthMath'
import { healthProfile, measurementsBetween, saveHealthProfile, sleepsBetween, intakesBetween } from './healthRepo'
import { trainingsBetween } from '@/features/training/trainingRepo'
import { weekRange } from '@/features/week/weekMath'

const GOAL_TYPES: HealthGoalType[] = [
  'weightRange', 'waistMax', 'strengthReps', 'strengthLoad', 'sleepBedtime', 'proteinDays',
]

function nowTimestamp() {
  return Date.now()
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`
}

function monthEnd(day: string) {
  const [year, month] = day.split('-').map(Number)
  const end = new Date(year, month, 0).getDate()
  return `${day.slice(0, 7)}-${String(end).padStart(2, '0')}`
}

function positive(text: string, max = 1000) {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 && value <= max ? value : null
}

export default function GoalsPage() {
  const { t } = useI18n()
  const today = todayKey()
  const week = weekRange(today)
  const monthFrom = monthStart(today)
  const baseFrom = week.from < monthFrom ? week.from : monthFrom
  const profile = useLiveQuery(() => healthProfile(), [])
  const measurements = useLiveQuery(() => measurementsBetween('0000-01-01', today), [today]) ?? []
  const trainings = useLiveQuery(() => trainingsBetween('0000-01-01', today), [today]) ?? []
  const sleeps = useLiveQuery(() => sleepsBetween(baseFrom, today), [baseFrom, today]) ?? []
  const intakes = useLiveQuery(() => intakesBetween(baseFrom, today), [baseFrom, today]) ?? []

  const [type, setType] = useState<HealthGoalType>('weightRange')
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [exerciseName, setExerciseName] = useState('')
  const [targetTime, setTargetTime] = useState('')
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [targetDaysText, setTargetDaysText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const min = positive(minText, 500)
  const max = positive(maxText, 500)
  const target = positive(targetText, type === 'proteinDays' ? 500 : type === 'waistMax' ? 250 : 1000)
  const targetDays = positive(targetDaysText, period === 'week' ? 7 : 31)
  const valid = type === 'weightRange'
    ? min !== null && max !== null && min < max
    : type === 'waistMax'
      ? target !== null && target >= 20
      : type === 'strengthReps' || type === 'strengthLoad'
        ? exerciseName.trim() !== '' && target !== null && (type !== 'strengthReps' || target >= 1)
        : type === 'sleepBedtime'
          ? /^([01]\d|2[0-3]):[0-5]\d$/.test(targetTime) && targetDays !== null
          : target !== null && targetDays !== null

  const activePeriod = (goal: HealthGoal) => goal.period === 'week'
    ? week
    : { from: monthFrom, to: monthEnd(today) }

  const progresses = new Map<string, { observed: Set<string>; met: Set<string> }>()
  for (const goal of profile?.goals ?? []) {
    if (!goal.enabled || (goal.type !== 'sleepBedtime' && goal.type !== 'proteinDays')) continue
    const range = activePeriod(goal)
    const state = { observed: new Set<string>(), met: new Set<string>() }
    if (goal.type === 'sleepBedtime') {
      for (const sleep of sleeps) {
        if (sleep.dateKey < range.from || sleep.dateKey > range.to || sleep.bedtime === '') continue
        state.observed.add(sleep.dateKey)
        if (sleep.bedtime <= goal.targetTime) state.met.add(sleep.dateKey)
      }
    } else {
      const totals = new Map<string, number>()
      for (const intake of intakes) {
        if (intake.dateKey < range.from || intake.dateKey > range.to) continue
        state.observed.add(intake.dateKey)
        totals.set(intake.dateKey, (totals.get(intake.dateKey) ?? 0) + intake.protein)
      }
      for (const [day, grams] of totals) if (grams >= (goal.targetValue ?? Infinity)) state.met.add(day)
    }
    progresses.set(goal.id, state)
  }

  async function persistGoals(goals: HealthGoal[]) {
    const base = profile ?? emptyProfile()
    await saveHealthProfile({ ...base, goals, updatedAt: nowTimestamp() })
  }

  function resetForm() {
    setEditingId(null)
    setType('weightRange')
    setMinText('')
    setMaxText('')
    setTargetText('')
    setExerciseName('')
    setTargetTime('')
    setPeriod('week')
    setTargetDaysText('')
  }

  async function addGoal() {
    if (!valid) return
    const now = nowTimestamp()
    const existing = (profile?.goals ?? []).find((goal) => goal.id === editingId)
    const goal: HealthGoal = {
      id: existing?.id ?? newId(),
      type,
      minValue: type === 'weightRange' ? min : null,
      maxValue: type === 'weightRange' ? max : null,
      targetValue: type === 'weightRange' ? null : target,
      targetTime: type === 'sleepBedtime' ? targetTime : '',
      exerciseName: type === 'strengthReps' || type === 'strengthLoad' ? exerciseName.trim() : '',
      period: type === 'sleepBedtime' || type === 'proteinDays' ? period : 'week',
      targetDays: type === 'sleepBedtime' || type === 'proteinDays' ? targetDays : null,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const goals = existing
      ? (profile?.goals ?? []).map((item) => item.id === existing.id ? goal : item)
      : [...(profile?.goals ?? []), goal]
    await persistGoals(goals)
    resetForm()
  }

  function editGoal(goal: HealthGoal) {
    setEditingId(goal.id)
    setType(goal.type)
    setMinText(goal.minValue === null ? '' : String(goal.minValue))
    setMaxText(goal.maxValue === null ? '' : String(goal.maxValue))
    setTargetText(goal.targetValue === null ? '' : String(goal.targetValue))
    setExerciseName(goal.exerciseName)
    setTargetTime(goal.targetTime)
    setPeriod(goal.period)
    setTargetDaysText(goal.targetDays === null ? '' : String(goal.targetDays))
  }

  async function updateGoal(id: string, patch: Partial<HealthGoal>) {
    const goals = (profile?.goals ?? []).map((goal) =>
      goal.id === id ? { ...goal, ...patch, updatedAt: nowTimestamp() } : goal,
    )
    await persistGoals(goals)
  }

  function goalStatus(goal: HealthGoal) {
    if (goal.type === 'weightRange') {
      const latest = profile?.weighIns?.[0]
      return latest
        ? t('health.goalWeightStatus', {
            value: latest.weightKg,
            min: goal.minValue ?? 0,
            max: goal.maxValue ?? 0,
          })
        : t('health.goalNoEvidence')
    }
    if (goal.type === 'waistMax') {
      const latest = [...measurements].reverse().find((item) => item.waistCm !== null)
      return latest
        ? t('health.goalWaistStatus', { value: latest.waistCm ?? 0, target: goal.targetValue ?? 0 })
        : t('health.goalNoEvidence')
    }
    if (goal.type === 'strengthReps' || goal.type === 'strengthLoad') {
      let best: number | null = null
      for (const training of trainings) {
        if (training.deletedAt !== null) continue
        for (const exercise of training.exercises) {
          if (exercise.name.trim().toLocaleLowerCase() !== goal.exerciseName.toLocaleLowerCase()) continue
          const values = exercise.sets.flatMap((set) => {
            const value = goal.type === 'strengthReps' ? set.reps : set.weightKg
            return value === null ? [] : [value]
          })
          if (values.length) best = Math.max(best ?? 0, ...values)
        }
      }
      return best === null
        ? t('health.goalNoEvidence')
        : t('health.goalStrengthStatus', {
            value: best,
            target: goal.targetValue ?? 0,
            unit: goal.type === 'strengthReps' ? t('health.goalRepsUnit') : 'kg',
          })
    }
    const state = progresses.get(goal.id)
    if (!state || state.observed.size === 0) return t('health.goalNoEvidence')
    return t('health.goalBehaviorStatus', {
      met: state.met.size,
      target: goal.targetDays ?? 0,
      observed: state.observed.size,
    })
  }

  function goalLabel(goal: HealthGoal) {
    const typeLabel = t(`health.goalType.${goal.type}` as MessageKey)
    if (goal.type === 'weightRange') return `${typeLabel} · ${goal.minValue}–${goal.maxValue} kg`
    if (goal.type === 'waistMax') return `${typeLabel} · ≤ ${goal.targetValue} cm`
    if (goal.type === 'strengthReps' || goal.type === 'strengthLoad') {
      return `${typeLabel} · ${goal.exerciseName} · ${goal.targetValue}${goal.type === 'strengthLoad' ? ' kg' : ''}`
    }
    if (goal.type === 'sleepBedtime') return `${typeLabel} · ${goal.targetTime} · ${goal.targetDays}/${goal.period === 'week' ? 7 : 31}`
    return `${typeLabel} · ${goal.targetValue} g · ${goal.targetDays}/${goal.period === 'week' ? 7 : 31}`
  }

  const inputClass = 'h-10 min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-sm tabular-nums text-fg'

  return (
    <div className="w-full p-4">
      <header className="flex items-center gap-2">
        <BackButton to="/health" label={t('nav.health')} icon className={`${NAV_BACK_BUTTON} gap-1`} />
        <h1 className="m-0 text-base font-medium text-fg">{t('health.goalsTitle')}</h1>
      </header>
      <p className="mb-0 mt-2 text-xs text-muted">{t('health.goalsIntro')}</p>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <label className="block text-xs text-muted">
          {t('health.goalTypeLabel')}
          <select value={type} onChange={(event) => setType(event.currentTarget.value as HealthGoalType)} className={`${inputClass} mt-1 w-full`}>
            {GOAL_TYPES.map((item) => <option key={item} value={item}>{t(`health.goalType.${item}` as MessageKey)}</option>)}
          </select>
        </label>
        {type === 'weightRange' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">{t('health.goalMin')}<input type="number" min="1" max="500" step="0.1" value={minText} onChange={(event) => setMinText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
            <label className="text-xs text-muted">{t('health.goalMax')}<input type="number" min="1" max="500" step="0.1" value={maxText} onChange={(event) => setMaxText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
          </div>
        ) : type === 'strengthReps' || type === 'strengthLoad' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">{t('health.goalExercise')}<input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
            <label className="text-xs text-muted">{t('health.goalTarget')}<input type="number" min="0" max="1000" step="0.1" value={targetText} onChange={(event) => setTargetText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
          </div>
        ) : type === 'sleepBedtime' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">{t('health.goalTime')}<input type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
            <label className="text-xs text-muted">{t('health.goalDays')}<input type="number" min="1" max={period === 'week' ? 7 : 31} value={targetDaysText} onChange={(event) => setTargetDaysText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
          </div>
        ) : (
          <label className="mt-3 block text-xs text-muted">{t('health.goalTarget')}<input type="number" min="1" max={type === 'proteinDays' ? 500 : 250} step="0.1" value={targetText} onChange={(event) => setTargetText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
        )}
        {(type === 'sleepBedtime' || type === 'proteinDays') && (
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-muted">{t('health.goalPeriod')}</label>
            <select value={period} onChange={(event) => setPeriod(event.currentTarget.value as 'week' | 'month')} className={`${inputClass} flex-1`}>
              <option value="week">{t('health.goalWeek')}</option>
              <option value="month">{t('health.goalMonth')}</option>
            </select>
          </div>
        )}
        {type !== 'weightRange' && type !== 'waistMax' && type !== 'strengthReps' && type !== 'strengthLoad' && type !== 'sleepBedtime' && (
          <label className="mt-3 block text-xs text-muted">{t('health.goalDays')}<input type="number" min="1" max={period === 'week' ? 7 : 31} value={targetDaysText} onChange={(event) => setTargetDaysText(event.target.value)} className={`${inputClass} mt-1 w-full`} /></label>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!valid} onClick={() => void addGoal()} className="h-10 rounded-xl bg-brand px-4 text-sm text-white disabled:opacity-40">{t(editingId ? 'health.goalSave' : 'health.goalAdd')}</button>
          {editingId && <button type="button" onClick={resetForm} className="h-10 rounded-xl border border-line px-4 text-sm text-fg">{t('health.goalCancel')}</button>}
        </div>
      </section>

      <section className="mt-4 space-y-2">
        {(profile?.goals ?? []).length === 0 ? (
          <p className="m-0 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t('health.goalsEmpty')}</p>
        ) : (profile?.goals ?? []).map((goal) => (
          <article key={goal.id} className={`rounded-2xl border border-line bg-surface p-4 ${goal.enabled ? '' : 'opacity-65'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-sm font-medium text-fg">{goalLabel(goal)}</h2>
                <p className="m-0 mt-1 text-xs text-muted">{goal.enabled ? goalStatus(goal) : t('health.goalPaused')}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => editGoal(goal)} className="text-xs text-brand">{t('health.goalEdit')}</button>
                <button type="button" onClick={() => void updateGoal(goal.id, { enabled: !goal.enabled })} className="text-xs text-brand">{t(goal.enabled ? 'health.goalPause' : 'health.goalResume')}</button>
                <button type="button" onClick={() => void persistGoals((profile?.goals ?? []).filter((item) => item.id !== goal.id))} className="text-xs text-danger">{t('health.goalDelete')}</button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
