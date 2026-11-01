import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import type { HealthFood } from '@/core/db/schema'
import { buildAssistantAction, describeAction } from './assistantActionBuild'

function emptyData(): BackupData {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    sleeps: [],
    finance: [],
  }
}

function food(overrides: Partial<HealthFood> = {}): HealthFood {
  return {
    id: 'food_1',
    code: 'a000001',
    name: '鸡胸肉',
    kcal: 133,
    protein: 24,
    carbs: 0,
    fat: 5,
    servingName: null,
    servingGrams: null,
    photo: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

const CTX = { data: emptyData(), today: '2026-10-28', now: new Date(2026, 9, 28, 9, 5).getTime() }

describe('add_finance', () => {
  it('默认记今天、收正数金额、只认匹配方向的分类', () => {
    const result = buildAssistantAction(
      'add_finance',
      { name: '午饭', amount: 28.456, direction: 'expense', category: 'food' },
      CTX,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'finance') {
      expect(result.action).toMatchObject({
        dateKey: '2026-10-28',
        direction: 'expense',
        name: '午饭',
        amount: 28.46,
        category: 'food',
      })
    }
  })

  it('收入方向不接受支出分类', () => {
    const result = buildAssistantAction(
      'add_finance',
      { name: '工资', amount: 1000, direction: 'income', category: 'food' },
      CTX,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'finance') {
      expect(result.action.category).toBe('')
    }
  })

  it('未来日期和非法金额都拦住', () => {
    expect(
      buildAssistantAction('add_finance', { date: '2026-11-01', name: 'x', amount: 1 }, CTX).ok,
    ).toBe(false)
    expect(buildAssistantAction('add_finance', { name: 'x', amount: 0 }, CTX).ok).toBe(false)
    expect(buildAssistantAction('add_finance', { amount: 1 }, CTX).ok).toBe(false)
  })
})

describe('add_stamp / add_diary / add_sleep', () => {
  it('没说时刻就记现在', () => {
    const result = buildAssistantAction('add_stamp', { content: '开完周会' }, CTX)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'stamp') {
      expect(result.action.time).toBe('09:05')
      expect(result.action.dateKey).toBe('2026-10-28')
    }
  })

  it('空内容拒绝', () => {
    expect(buildAssistantAction('add_stamp', { content: '  ' }, CTX).ok).toBe(false)
    expect(buildAssistantAction('add_diary', {}, CTX).ok).toBe(false)
  })

  it('睡眠时刻不合法时给一句人话；当天已有记录时标记覆盖', () => {
    expect(
      buildAssistantAction('add_sleep', { bedtime: '25:00', wakeTime: '07:00' }, CTX).ok,
    ).toBe(false)

    const data = emptyData()
    data.sleeps.push({
      id: 'sl_1',
      code: 'd000001',
      dateKey: '2026-10-28',
      bedtime: '23:00',
      wakeTime: '07:00',
      quality: 3,
      wakeEvents: [],
      naps: [],
      wakeCount: null,
      wakeMinutes: null,
      note: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    const result = buildAssistantAction(
      'add_sleep',
      { bedtime: '23:30', wakeTime: '07:10', quality: 4 },
      { data, today: '2026-10-28' },
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'sleep') {
      expect(result.action).toMatchObject({ bedtime: '23:30', wakeTime: '07:10', quality: 4, overwrite: true })
    }
  })
})

describe('add_weigh / add_intake', () => {
  it('体重范围收在 20–400 kg', () => {
    expect(buildAssistantAction('add_weigh', { weightKg: 65.44 }, CTX).ok).toBe(true)
    expect(buildAssistantAction('add_weigh', { weightKg: 5 }, CTX).ok).toBe(false)
    expect(buildAssistantAction('add_weigh', { weightKg: 500 }, CTX).ok).toBe(false)
  })

  it('从食物库按克数换算营养', () => {
    const data = emptyData()
    data.foods.push(food())
    const result = buildAssistantAction(
      'add_intake',
      { foodId: 'food_1', grams: 150 },
      { data, today: '2026-10-28', now: CTX.now },
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'intake') {
      expect(result.action).toMatchObject({
        name: '鸡胸肉',
        grams: 150,
        kcal: 200,
        protein: 36,
        carbs: 0,
        fat: 7.5,
      })
    }
  })

  it('食物库里找不到时不瞎猜', () => {
    const result = buildAssistantAction('add_intake', { foodId: 'nope', grams: 100 }, CTX)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('search_food')
  })

  it('手记必须带用户给的热量', () => {
    expect(buildAssistantAction('add_intake', { name: '外卖', grams: 300 }, CTX).ok).toBe(false)
    const result = buildAssistantAction(
      'add_intake',
      { name: '外卖', grams: 300, kcal: 600 },
      CTX,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'intake') {
      expect(result.action.foodId).toBeNull()
      expect(result.action.kcal).toBe(600)
    }
  })
})

describe('remember / describeAction', () => {
  it('没给分类时按事实记', () => {
    const result = buildAssistantAction('remember', { text: '不吃香菜' }, CTX)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'memory') {
      expect(result.action.memoryKind).toBe('fact')
      expect(result.action.text).toBe('不吃香菜')
    }
  })

  it('描述能说清记的是什么', () => {
    expect(
      describeAction({
        kind: 'finance',
        dateKey: '2026-10-28',
        direction: 'expense',
        name: '午饭',
        amount: 28,
        note: '',
        category: '',
      }),
    ).toContain('午饭 28 元')
    expect(
      describeAction({
        kind: 'memory',
        text: '不吃香菜',
        memoryKind: 'preference',
      }),
    ).toContain('不吃香菜')
  })

  it('不认识的工具名不生成动作', () => {
    expect(buildAssistantAction('drop_table', {}, CTX).ok).toBe(false)
  })
})

describe('改与删已有记录', () => {
  function dataWithRecords(): BackupData {
    const data = emptyData()
    data.entries.push({
      id: 'en_1',
      code: 'a000001',
      dateKey: '2026-10-20',
      content: '旧日记',
      images: [],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    data.stamps.push({
      id: 'st_1',
      code: 'b000001',
      dateKey: '2026-10-26',
      time: '14:00',
      content: '喝了杯咖啡',
      images: [],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    data.finance.push({
      id: 'fi_1',
      code: 'c000001',
      dateKey: '2026-10-27',
      kind: 'expense',
      category: 'food',
      name: '午饭',
      amount: 30,
      note: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    data.intakes.push({
      id: 'in_1',
      code: 'd000001',
      dateKey: '2026-10-27',
      time: '12:00',
      foodId: null,
      name: '米饭',
      grams: 200,
      kcal: 230,
      protein: 4,
      carbs: 50,
      fat: 1,
      source: 'manual',
      mealId: null,
      components: null,
      tdeeSnapshot: null,
      targetKcalSnapshot: null,
      proteinTargetSnapshot: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    data.sleeps.push({
      id: 'sl_1',
      code: 'e000001',
      dateKey: '2026-10-27',
      bedtime: '23:30',
      wakeTime: '07:10',
      quality: 4,
      wakeEvents: [],
      naps: [],
      wakeCount: null,
      wakeMinutes: null,
      note: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    return data
  }

  const editCtx = { data: dataWithRecords(), today: '2026-10-28' }

  it('改日记要能按 code 找到那一条', () => {
    const result = buildAssistantAction(
      'update_diary',
      { code: 'a000001', content: '新的日记' },
      editCtx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'diaryEdit') {
      expect(result.action).toMatchObject({ dateKey: '2026-10-20', content: '新的日记' })
    }
    expect(buildAssistantAction('update_diary', { code: 'nope', content: 'x' }, editCtx).ok).toBe(
      false,
    )
  })

  it('改随记至少要有内容或时刻', () => {
    expect(buildAssistantAction('update_stamp', { code: 'b000001' }, editCtx).ok).toBe(false)
    const result = buildAssistantAction(
      'update_stamp',
      { code: 'b000001', time: '15:30' },
      editCtx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'stampEdit') {
      expect(result.action.time).toBe('15:30')
      expect(result.action.content).toBeUndefined()
    }
  })

  it('改收支只带要改的字段，并校验分类方向', () => {
    const result = buildAssistantAction(
      'update_finance',
      { code: 'c000001', amount: 25.5 },
      editCtx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'financeEdit') {
      expect(result.action.amount).toBe(25.5)
      expect(result.action.name).toBeUndefined()
    }
    expect(
      buildAssistantAction(
        'update_finance',
        { code: 'c000001', category: 'salary' },
        editCtx,
      ).ok,
    ).toBe(false)
  })

  it('删除动作保留足够信息给卡片和撤销', () => {
    const stamp = buildAssistantAction('delete_stamp', { code: 'b000001' }, editCtx)
    expect(stamp.ok).toBe(true)
    if (stamp.ok && stamp.action.kind === 'stampDelete') {
      expect(stamp.action.content).toContain('咖啡')
    }
    const intake = buildAssistantAction('delete_intake', { code: 'd000001' }, editCtx)
    expect(intake.ok).toBe(true)
    if (intake.ok && intake.action.kind === 'intakeDelete') {
      expect(intake.action).toMatchObject({ name: '米饭', kcal: 230 })
    }
    expect(buildAssistantAction('delete_sleep', { date: '2026-10-27' }, editCtx).ok).toBe(true)
    expect(buildAssistantAction('delete_sleep', { date: '2026-10-26' }, editCtx).ok).toBe(false)
  })
})
