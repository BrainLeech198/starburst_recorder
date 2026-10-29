import { describe, expect, it } from 'vitest'
import {
  activityFromQuestions,
  barPercent,
  barScale,
  bmr,
  dayTargets,
  derivedTdee,
  estimateTdee,
  foodMacros,
  isWeighDay,
  macroKcal,
  missingProfileFields,
  remainingKcal,
  suggestProteinForPlan,
  sumMacros,
  weekdayOf,
} from './healthMath'
import type { HealthProfile } from '@/core/db/schema'

function profile(overrides: Partial<HealthProfile> = {}): HealthProfile {
  return {
    id: 'me',
    sex: 'male',
    age: 20,
    heightCm: 176,
    weightKg: 63,
    weightAt: 1,
    activity: 'sedentary',
    tdee: 2350,
    targetKcal: 2050,
    proteinTarget: 100,
    plan: '',
    note: '',
    weighDay: null,
    weighTime: '07:00',
    weighIns: [],
    updatedAt: 1,
    ...overrides,
  }
}

describe('健康计算的公式部分', () => {
  it('Mifflin-St Jeor 男女常数不同', () => {
    const base = { age: 20, heightCm: 176, weightKg: 63 }
    expect(bmr({ ...base, sex: 'male' })).toBe(1635)
    expect(bmr({ ...base, sex: 'female' })).toBe(1469)
  })

  it('缺字段时不瞎算', () => {
    expect(bmr({ sex: null, age: 20, heightCm: 176, weightKg: 63 })).toBeNull()
    expect(estimateTdee({ sex: 'male', age: null, heightCm: 176, weightKg: 63, activity: 'light' })).toBeNull()
  })

  it('活动系数乘完取整到十位', () => {
    expect(
      estimateTdee({ sex: 'male', age: 20, heightCm: 176, weightKg: 63, activity: 'sedentary' }),
    ).toBe(1960)
    expect(
      estimateTdee({ sex: 'male', age: 20, heightCm: 176, weightKg: 63, activity: 'moderate' }),
    ).toBe(2530)
  })
})

describe('食物换算与当日汇总', () => {
  const chicken = {
    id: 'f1',
    name: '鸡胸肉',
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    servingName: '1 块',
    servingGrams: 120,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  }

  it('按克数等比换算', () => {
    expect(foodMacros(chicken, 120)).toEqual({ kcal: 198, protein: 37.2, carbs: 0, fat: 4.3 })
  })

  it('三大营养素反推热量', () => {
    expect(macroKcal(30, 40, 10)).toBe(370)
  })

  it('汇总一天的多笔', () => {
    const total = sumMacros([
      foodMacros(chicken, 120),
      { kcal: 300, protein: 5, carbs: 60, fat: 2 },
    ])
    expect(total).toEqual({ kcal: 498, protein: 42.2, carbs: 60, fat: 6.3 })
  })

  it('剩余额度可以是负数', () => {
    expect(remainingKcal(2050, 1600)).toBe(450)
    expect(remainingKcal(2050, 2400)).toBe(-350)
    expect(remainingKcal(null, 2400)).toBeNull()
  })
})

describe('进度条的比例', () => {
  it('量程固定到 TDEE 的 1.35 倍', () => {
    expect(barScale(2350)).toBe(3173)
    expect(barScale(null)).toBe(0)
  })

  it('超出量程时停在 100%', () => {
    expect(barPercent(1586.5, 3173)).toBeCloseTo(50, 5)
    expect(barPercent(5000, 3173)).toBe(100)
  })
})

describe('档案完整性', () => {
  it('全填了就没有缺项', () => {
    expect(missingProfileFields(profile())).toEqual([])
  })

  it('没填过时把该填的都列出来', () => {
    expect(missingProfileFields(undefined)).toHaveLength(6)
  })

  it('只缺目标热量时文案只报这一项', () => {
    expect(missingProfileFields(profile({ targetKcal: null }))).toEqual(['targetKcal'])
  })
})

describe('蛋白目标与计划联动', () => {
  it('减脂比维持给更高的蛋白系数', () => {
    expect(suggestProteinForPlan(63, 'cut')).toBe(113) // 63 × 1.8
    expect(suggestProteinForPlan(63, 'maintain')).toBe(101) // 63 × 1.6
  })

  it('增肌系数最高', () => {
    expect(suggestProteinForPlan(63, 'bulk')).toBe(126) // 63 × 2.0
  })

  it('没体重或没计划时不给建议', () => {
    expect(suggestProteinForPlan(null, 'cut')).toBeNull()
    expect(suggestProteinForPlan(63, undefined)).toBe(101)
  })
})

describe('活动水平小助手', () => {
  it('完全不运动就是久坐', () => {
    expect(activityFromQuestions(0, 0)).toBe('sedentary')
  })

  it('每周 4 次每次 45 分钟算中度', () => {
    expect(activityFromQuestions(4, 45)).toBe('moderate')
  })

  it('每周 6 次以上算高强度', () => {
    expect(activityFromQuestions(6, 30)).toBe('high')
  })
})

describe('每天的目标线', () => {
  function intake(overrides: {
    time: string
    createdAt?: number
    tdeeSnapshot?: number | null
    targetKcalSnapshot?: number | null
    proteinTargetSnapshot?: number | null
  }) {
    return {
      time: overrides.time,
      createdAt: overrides.createdAt ?? 1,
      tdeeSnapshot: overrides.tdeeSnapshot ?? null,
      targetKcalSnapshot: overrides.targetKcalSnapshot ?? null,
      proteinTargetSnapshot: overrides.proteinTargetSnapshot ?? null,
    }
  }

  it('当天没记过就用当前档案', () => {
    expect(dayTargets([], profile())).toEqual({
      tdee: 2350,
      targetKcal: 2050,
      proteinTarget: 100,
    })
  })

  it('按当天第一笔的快照走，后面补记不改线', () => {
    const list = [
      intake({ time: '12:30', tdeeSnapshot: 2400, targetKcalSnapshot: 2100, proteinTargetSnapshot: 110 }),
      intake({ time: '08:10', tdeeSnapshot: 2200, targetKcalSnapshot: 1900, proteinTargetSnapshot: 90 }),
    ]
    // 08:10 才是第一笔，即使数组里排在后面
    expect(dayTargets(list, profile())).toEqual({
      tdee: 2200,
      targetKcal: 1900,
      proteinTarget: 90,
    })
  })

  it('第一笔是旧记录没有快照就整段回退到当前档案', () => {
    const list = [
      intake({ time: '08:00' }),
      intake({ time: '12:00', tdeeSnapshot: 2000, targetKcalSnapshot: 1800, proteinTargetSnapshot: 80 }),
    ]
    expect(dayTargets(list, profile())).toEqual({
      tdee: 2350,
      targetKcal: 2050,
      proteinTarget: 100,
    })
  })

  it('今天改了档案，今天的线跟着新档案走，而不是第一笔的旧快照', () => {
    const list = [
      intake({ time: '08:00', tdeeSnapshot: 2200, targetKcalSnapshot: 1900, proteinTargetSnapshot: 90 }),
    ]
    const changed = profile({ tdee: 2400, targetKcal: 2100, proteinTarget: 120 })
    expect(dayTargets(list, changed, true)).toEqual({
      tdee: 2400,
      targetKcal: 2100,
      proteinTarget: 120,
    })
  })

  it('过去的日子仍按当天第一笔的快照，改档案不倒改历史', () => {
    const list = [
      intake({ time: '08:00', tdeeSnapshot: 2200, targetKcalSnapshot: 1900, proteinTargetSnapshot: 90 }),
    ]
    const changed = profile({ tdee: 2400, targetKcal: 2100, proteinTarget: 120 })
    expect(dayTargets(list, changed, false)).toEqual({
      tdee: 2200,
      targetKcal: 1900,
      proteinTarget: 90,
    })
  })

  it('今天档案缺项时回退到当天第一笔快照', () => {
    const list = [
      intake({ time: '08:00', tdeeSnapshot: 2200, targetKcalSnapshot: 1900, proteinTargetSnapshot: 90 }),
    ]
    const changed = profile({ tdee: 2400, targetKcal: null, proteinTarget: null })
    expect(dayTargets(list, changed, true)).toEqual({
      tdee: 2400,
      targetKcal: 1900,
      proteinTarget: 90,
    })
  })
})

describe('推算 TDEE（能量收支法）', () => {
  const days = (start: string, count: number) => {
    const out: string[] = []
    const base = new Date(start + 'T00:00:00Z').getTime()
    for (let i = 0; i < count; i += 1) {
      out.push(new Date(base + i * 86400000).toISOString().slice(0, 10))
    }
    return out
  }
  const intakeFull = (start: string, count: number, kcal: number) =>
    Object.fromEntries(days(start, count).map((d) => [d, kcal]))

  it('体重稳定时约等于日均摄入', () => {
    const result = derivedTdee({
      weighIns: [
        { dateKey: '2026-10-01', weightKg: 62 },
        { dateKey: '2026-10-15', weightKg: 62 },
      ],
      intakeKcalByDay: intakeFull('2026-10-01', 15, 2000),
    })
    expect(result).toBe(2000)
  })

  it('掉秤就把消耗算高', () => {
    // 14 天掉 1kg ≈ 每天多耗 550，TDEE ≈ 2000 + 550
    const result = derivedTdee({
      weighIns: [
        { dateKey: '2026-10-01', weightKg: 63 },
        { dateKey: '2026-10-15', weightKg: 62 },
      ],
      intakeKcalByDay: intakeFull('2026-10-01', 15, 2000),
    })
    expect(result).toBe(2550)
  })

  it('长秤就把消耗算低', () => {
    const result = derivedTdee({
      weighIns: [
        { dateKey: '2026-10-01', weightKg: 61 },
        { dateKey: '2026-10-15', weightKg: 62 },
      ],
      intakeKcalByDay: intakeFull('2026-10-01', 15, 2000),
    })
    expect(result).toBe(1450)
  })

  it('称重少于两次、跨度太短、摄入太少都不算', () => {
    const intake = intakeFull('2026-10-01', 15, 2000)
    expect(derivedTdee({ weighIns: [{ dateKey: '2026-10-01', weightKg: 62 }], intakeKcalByDay: intake })).toBeNull()
    expect(
      derivedTdee({
        weighIns: [
          { dateKey: '2026-10-01', weightKg: 62 },
          { dateKey: '2026-10-03', weightKg: 62 },
        ],
        intakeKcalByDay: intake,
      }),
    ).toBeNull()
    expect(
      derivedTdee({
        weighIns: [
          { dateKey: '2026-10-01', weightKg: 62 },
          { dateKey: '2026-10-15', weightKg: 62 },
        ],
        intakeKcalByDay: intakeFull('2026-10-01', 3, 2000),
      }),
    ).toBeNull()
  })

  it('窗口外的旧称重不算', () => {
    const result = derivedTdee({
      weighIns: [
        { dateKey: '2026-09-01', weightKg: 70 },
        { dateKey: '2026-10-01', weightKg: 62 },
        { dateKey: '2026-10-15', weightKg: 62 },
      ],
      intakeKcalByDay: intakeFull('2026-10-01', 15, 2000),
    })
    expect(result).toBe(2000)
  })
})

describe('称重日判断', () => {
  it('weekdayOf：周一=1、周日=7', () => {
    expect(weekdayOf('2026-10-26')).toBe(1) // 周一
    expect(weekdayOf('2026-11-01')).toBe(7) // 周日
    expect(weekdayOf('bad')).toBeNull()
  })

  it('isWeighDay 只在设好的那天为真', () => {
    expect(isWeighDay('2026-10-26', 1)).toBe(true)
    expect(isWeighDay('2026-10-27', 1)).toBe(false)
    expect(isWeighDay('2026-10-26', null)).toBe(false)
  })
})
