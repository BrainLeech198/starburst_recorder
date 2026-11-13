import type { HealthTraining, TrainingSet } from '@/core/db/schema'

export interface ExerciseProgressPoint {
  dateKey: string
  time: string
  title: string
  reps: number | null
  loadKg: number | null
  volumeKg: number | null
  signature: string | null
}

export interface ExerciseProgress {
  name: string
  points: ExerciseProgressPoint[]
  plateau: boolean
}

function progressSignature(sets: TrainingSet[]): string | null {
  const comparable = sets.filter((set) => set.reps !== null)
  return comparable.length === 0
    ? null
    : JSON.stringify(comparable.map((set) => [set.reps, set.weightKg]))
}

/** 按动作名汇总最近表现；负重容量只统计明确填写次数和负重的组。 */
export function exerciseProgressOf(trainings: HealthTraining[]): ExerciseProgress[] {
  const grouped = new Map<string, { name: string; points: ExerciseProgressPoint[] }>()
  const alive = trainings
    .filter((training) => training.deletedAt === null)
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time))

  for (const training of alive) {
    const names = new Map<string, { name: string; sets: TrainingSet[] }>()
    for (const exercise of training.exercises ?? []) {
      const name = exercise.name.trim()
      const key = name.toLocaleLowerCase()
      if (key === '') continue
      const entry = names.get(key) ?? { name, sets: [] }
      entry.sets.push(...exercise.sets)
      names.set(key, entry)
    }
    for (const [key, exercise] of names) {
      const validReps = exercise.sets.flatMap((set) => set.reps === null ? [] : [set.reps])
      const validLoads = exercise.sets.flatMap((set) => set.weightKg === null ? [] : [set.weightKg])
      const weightedSets = exercise.sets.filter((set) => set.reps !== null && set.weightKg !== null)
      const point: ExerciseProgressPoint = {
        dateKey: training.dateKey,
        time: training.time,
        title: training.title,
        reps: validReps.length ? Math.max(...validReps) : null,
        loadKg: validLoads.length ? Math.max(...validLoads) : null,
        volumeKg: weightedSets.length
          ? Math.round(weightedSets.reduce((sum, set) => sum + (set.reps ?? 0) * (set.weightKg ?? 0), 0) * 10) / 10
          : null,
        signature: progressSignature(exercise.sets),
      }
      const entry = grouped.get(key) ?? { name: exercise.name, points: [] }
      entry.points.push(point)
      grouped.set(key, entry)
    }
  }

  return [...grouped.values()]
    .map(({ name, points }) => {
      const comparable = points.filter((point) => point.signature !== null)
      const recent = comparable.slice(-3)
      return {
        name,
        points: points.slice(-8).reverse(),
        plateau: recent.length === 3 && recent.every((point) => point.signature === recent[0].signature),
      }
    })
    .sort((a, b) => (b.points[0]?.dateKey ?? '').localeCompare(a.points[0]?.dateKey ?? ''))
}
