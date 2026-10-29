/**
 * 推算 TDEE 的数据收集：把「每天摄入热量 + 称重历史」凑齐，交给 healthMath 的 derivedTdee。
 * 纯查询，不含界面；健康页和称重卡都用它。
 */
import { useLiveQuery } from '@/core/db/live'
import type { HealthProfile } from '@/core/db/schema'
import { todayKey } from '@/core/utils/dateKey'
import { intakeDays, intakesOfDay } from './healthRepo'
import { derivedTdee } from './healthMath'

/** 回看窗口取 28 天：比推算窗口（14 天）宽一倍，改窗口参数时不用回来改这里 */
const LOOKBACK_DAYS = 28

export function useDerivedTdee(profile: HealthProfile | undefined): number | null | undefined {
  return useLiveQuery(async () => {
    const weighIns = profile?.weighIns ?? []
    if (weighIns.length < 2) return null
    const end = new Date(todayKey() + 'T00:00:00Z').getTime()
    const start = end - LOOKBACK_DAYS * 86400000
    const intakeKcalByDay: Record<string, number> = {}
    for (const day of await intakeDays()) {
      const dayN = new Date(day + 'T00:00:00Z').getTime()
      if (dayN < start || dayN > end) continue
      const items = await intakesOfDay(day)
      const kcal = items.reduce((sum, item) => sum + item.kcal, 0)
      if (kcal > 0) intakeKcalByDay[day] = kcal
    }
    return derivedTdee({ weighIns, intakeKcalByDay })
  }, [profile?.weighIns, profile?.updatedAt])
}
