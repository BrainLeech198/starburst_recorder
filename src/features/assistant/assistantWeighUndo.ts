import type { HealthProfile } from '@/core/db/schema'

/** 撤销助手写入的单次称重；若同一天后来又被用户改过，则不覆盖后来的值。 */
export function undoWeighWrite(
  current: HealthProfile,
  previous: HealthProfile,
  dateKey: string,
  weightKg: number,
  appliedAt: number | null,
  now: number,
): HealthProfile | null {
  const applied = current.weighIns.find((item) =>
    item.dateKey === dateKey && (appliedAt === null ? item.weightKg === weightKg : item.createdAt === appliedAt),
  )
  if (!applied) return null
  // 这次写入之后档案没再变化：整份恢复，包含写入时因 120 条上限被挤掉的最旧称重。
  if (appliedAt !== null && current.updatedAt === appliedAt) {
    return { ...previous, updatedAt: now }
  }
  const old = previous.weighIns.find((item) => item.dateKey === dateKey)
  const weighIns = current.weighIns.filter((item) => item !== applied)
  if (old && !weighIns.some((item) => item.dateKey === dateKey)) weighIns.push(old)
  weighIns.sort((a, b) => b.createdAt - a.createdAt)
  const changedLatest = current.weightAt === applied.createdAt
  return {
    ...current,
    weighIns: weighIns.slice(0, 120),
    weightKg: changedLatest ? (weighIns[0]?.weightKg ?? previous.weightKg) : current.weightKg,
    weightAt: changedLatest ? (weighIns[0]?.createdAt ?? previous.weightAt) : current.weightAt,
    updatedAt: now,
  }
}
