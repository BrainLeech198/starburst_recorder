import type { HealthTraining, TrainingTemplate } from '@/core/db/schema'

/** Save the reusable workout content while dropping date-specific values. */
export function templateFromTraining(
  training: HealthTraining,
  name: string,
  id: string,
): TrainingTemplate | null {
  const cleanName = name.trim().slice(0, 80)
  if (cleanName === '' || (training.exercises.length === 0 && training.durationMin === null)) {
    return null
  }
  return {
    id,
    name: cleanName,
    kind: training.kind,
    title: training.title,
    exercises: training.exercises.map((exercise) => ({
      ...exercise,
      id: `${id}:${exercise.id}`,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
    durationMin: training.durationMin,
  }
}

/** Start a fresh, unsaved training from a template; never reuse its old time or notes. */
export function trainingFromTemplate(
  template: TrainingTemplate,
  dateKey: string,
  id: string,
  code: string,
  now: number,
): HealthTraining {
  return {
    id,
    code,
    dateKey,
    time: '',
    kind: template.kind,
    title: template.title,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      id: `${id}:${exercise.id}`,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
    durationMin: template.durationMin,
    feeling: null,
    note: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
