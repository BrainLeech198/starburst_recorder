import type { HealthTraining } from '@/core/db/schema'

export interface TrainingComparison {
  exerciseName: string
  previousDateKey: string
  previousMaxReps: number | null
  currentMaxReps: number | null
  previousMaxLoadKg: number | null
  currentMaxLoadKg: number | null
}

function exerciseMax(exercises: HealthTraining['exercises'], name: string) {
  const matches = exercises.filter((exercise) => exercise.name.trim().toLocaleLowerCase() === name)
  const reps = matches.flatMap((exercise) => exercise.sets.map((set) => set.reps))
    .filter((value): value is number => value !== null)
  const loads = matches.flatMap((exercise) => exercise.sets.map((set) => set.weightKg))
    .filter((value): value is number => value !== null)
  return {
    reps: reps.length ? Math.max(...reps) : null,
    load: loads.length ? Math.max(...loads) : null,
  }
}

/** Compare only same-named movements and return the previous matching session per movement. */
export function compareTrainingWithHistory(
  current: HealthTraining,
  history: HealthTraining[],
): TrainingComparison[] {
  const previous = history
    .filter((item) => item.id !== current.id && item.deletedAt === null)
    .slice()
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time))
  const seen = new Set<string>()
  const results: TrainingComparison[] = []

  for (const exercise of current.exercises) {
    const name = exercise.name.trim()
    const key = name.toLocaleLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    const oldTraining = previous.find((item) =>
      item.exercises.some((candidate) => candidate.name.trim().toLocaleLowerCase() === key),
    )
    if (!oldTraining) continue
    const oldValues = exerciseMax(oldTraining.exercises, key)
    const newValues = exerciseMax(current.exercises, key)
    if (oldValues.reps === null && oldValues.load === null) continue
    results.push({
      exerciseName: name,
      previousDateKey: oldTraining.dateKey,
      previousMaxReps: oldValues.reps,
      currentMaxReps: newValues.reps,
      previousMaxLoadKg: oldValues.load,
      currentMaxLoadKg: newValues.load,
    })
  }
  return results
}
