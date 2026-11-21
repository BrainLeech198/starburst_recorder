/**
 * 推算 TDEE 的数据收集：把「每天摄入热量 + 称重历史」凑齐，交给 healthMath 的 derivedTdee。
 * 纯查询，不含界面；健康页和称重卡都用它。
 */
import { useLiveQuery } from '@/core/db/live'
import type { HealthProfile } from '@/core/db/schema'
import { shiftDay, todayKey } from '@/core/utils/dateKey'
import { intakeDays, intakesOfDay } from './healthRepo'
import {
  DERIVED_TDEE_WINDOW_DAYS,
  derivedTdee,
  minimumPlausibleTdee,
} from './healthMath'

export function useDerivedTdee(profile: HealthProfile | undefined): number | null | undefined {
  return useLiveQuery(async () => {
    const weighIns = profile?.weighIns ?? []
    if (weighIns.length < 2) return null
    const today = todayKey()
    const startDateKey = shiftDay(today, -(DERIVED_TDEE_WINDOW_DAYS - 1))
    const intakeKcalByDay: Record<string, number> = {}
    for (const day of await intakeDays()) {
      if (day < startDateKey || day >= today) continue
      const items = await intakesOfDay(day)
      const kcal = items.reduce((sum, item) => sum + item.kcal, 0)
      if (kcal > 0) intakeKcalByDay[day] = kcal
    }
    return derivedTdee({
      weighIns,
      intakeKcalByDay,
      startDateKey,
      endDateKeyExclusive: today,
      minimumTdee: minimumPlausibleTdee(profile, weighIns, today),
    })
  }, [profile?.weighIns, profile?.updatedAt])
}
