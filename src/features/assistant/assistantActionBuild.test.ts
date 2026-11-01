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
    trainings: [],
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

  it('手记必须带热量与三大营养素', () => {
    expect(buildAssistantAction('add_intake', { name: '外卖', grams: 300 }, CTX).ok).toBe(false)
    // 只给热量不给三大营养素也要拦下，不能悄悄写成 0
    expect(
      buildAssistantAction('add_intake', { name: '外卖', grams: 300, kcal: 600 }, CTX).ok,
    ).toBe(false)
    const result = buildAssistantAction(
      'add_intake',
      { name: '外卖', grams: 300, kcal: 600, protein: 25, carbs: 60, fat: 20 },
      CTX,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'intake') {
      expect(result.action.foodId).toBeNull()
      expect(result.action.kcal).toBe(600)
      expect(result.action.protein).toBe(25)
      expect(result.action.carbs).toBe(60)
      expect(result.action.fat).toBe(20)
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
      time: '12:00:00',
      kind: 'expense',
      category: 'food',
      name: '午饭',
      amount: 30,
      photo: null,
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

describe('摄入原地改：改的是同一条记录', () => {
  function intakeData(): BackupData {
    const data = emptyData()
    data.foods.push(food())
    data.intakes.push({
      id: 'in_1',
      code: 'd000001',
      dateKey: '2026-10-27',
      time: '12:00',
      foodId: 'food_1',
      name: '鸡胸肉',
      grams: 100,
      kcal: 133,
      protein: 24,
      carbs: 0,
      fat: 5,
      source: 'library',
      mealId: null,
      components: null,
      tdeeSnapshot: null,
      targetKcalSnapshot: null,
      proteinTargetSnapshot: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    return data
  }

  const intakeCtx = { data: intakeData(), today: '2026-10-28' }

  it('只改克数时保持编号，交给执行层按食物库重算', () => {
    const result = buildAssistantAction('update_intake', { code: 'd000001', grams: 150 }, intakeCtx)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'intakeEdit') {
      expect(result.action).toMatchObject({ code: 'd000001', dateKey: '2026-10-27', grams: 150 })
      expect(result.action.kcal).toBeUndefined()
    }
  })

  it('换食物但没给克数时沿用原来的克数', () => {
    const result = buildAssistantAction('update_intake', { code: 'd000001', foodId: 'food_1' }, intakeCtx)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'intakeEdit') {
      expect(result.action.foodId).toBe('food_1')
      expect(result.action.grams).toBe(100)
    }
  })

  it('一个字段都不给就不出卡片', () => {
    expect(buildAssistantAction('update_intake', { code: 'd000001' }, intakeCtx).ok).toBe(false)
  })
})

describe('睡眠原地改', () => {
  it('必须显式给日期，且至少改一个字段', () => {
    const data = emptyData()
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
    const ctx = { data, today: '2026-10-28' }
    expect(buildAssistantAction('update_sleep', { date: '2026-10-27' }, ctx).ok).toBe(false)
    expect(buildAssistantAction('update_sleep', { bedtime: '23:00' }, ctx).ok).toBe(false)
    const result = buildAssistantAction('update_sleep', { date: '2026-10-27', quality: 5 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'sleepEdit') {
      expect(result.action).toMatchObject({ dateKey: '2026-10-27', quality: 5 })
    }
  })
})

describe('食物库、套餐、预设与记忆的增删改', () => {
  function libraryData(): BackupData {
    const data = emptyData()
    data.foods.push(food())
    data.meals.push({
      id: 'meal_1',
      name: '鸡腿饭',
      items: [{ foodId: 'food_1', grams: 120 }],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    data.presets.push({
      id: 'pr_1',
      code: 'f000001',
      kind: 'person',
      name: '小王',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    return data
  }

  const ctx = { data: libraryData(), today: '2026-10-28' }

  it('新增食物时营养按每 100g 收下', () => {
    const result = buildAssistantAction(
      'add_food',
      { name: '卤鸡腿', kcal: 180, protein: 20, carbs: 2, fat: 11 },
      ctx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'foodCreate') {
      expect(result.action).toMatchObject({ name: '卤鸡腿', kcal: 180, protein: 20, carbs: 2, fat: 11 })
      expect(result.action.servingName).toBeNull()
    }
    expect(buildAssistantAction('add_food', { name: '卤鸡腿', kcal: -1 }, ctx).ok).toBe(false)
  })

  it('新增食物缺营养时直接拒绝，不再静默写成 0', () => {
    const result = buildAssistantAction('add_food', { name: '卤鸡腿', kcal: 180 }, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('protein')
  })

  it('新增食物接受 nutrition 嵌套与下划线键名', () => {
    const result = buildAssistantAction(
      'add_food',
      {
        name: '卤鸡腿',
        per100g: { kcal: 180 },
        nutrition: { protein_g: 20, carbohydrates: 2, fat_g: 11 },
      },
      ctx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'foodCreate') {
      expect(result.action).toMatchObject({ kcal: 180, protein: 20, carbs: 2, fat: 11 })
    }
  })

  it('改食物只带要改的字段', () => {
    const result = buildAssistantAction('update_food', { code: 'a000001', kcal: 140 }, ctx)
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'foodEdit') {
      expect(result.action.kcal).toBe(140)
      expect(result.action.name).toBeUndefined()
    }
    expect(buildAssistantAction('update_food', { code: 'a000001' }, ctx).ok).toBe(false)
  })

  it('套餐按 mealId 定位，成分整体替换', () => {
    const result = buildAssistantAction(
      'update_meal',
      { mealId: 'meal_1', name: '鸡腿饭（大）', items: [{ foodId: 'food_1', grams: 200 }] },
      ctx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'mealEdit') {
      expect(result.action).toMatchObject({
        mealId: 'meal_1',
        name: '鸡腿饭（大）',
        items: [{ foodId: 'food_1', name: '鸡胸肉', grams: 200 }],
      })
    }
    expect(buildAssistantAction('update_meal', { mealId: 'nope', name: 'x' }, ctx).ok).toBe(false)
    expect(buildAssistantAction('update_meal', { mealId: 'meal_1' }, ctx).ok).toBe(false)
  })

  it('删套餐按 mealId，删食物、预设、日记按 code', () => {
    const meal = buildAssistantAction('delete_meal', { mealId: 'meal_1' }, ctx)
    expect(meal.ok).toBe(true)
    if (meal.ok && meal.action.kind === 'mealDelete') {
      expect(meal.action.name).toBe('鸡腿饭')
    }
    expect(buildAssistantAction('delete_food', { code: 'a000001' }, ctx).ok).toBe(true)
    expect(buildAssistantAction('delete_preset', { code: 'f000001' }, ctx).ok).toBe(true)

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
    expect(
      buildAssistantAction('delete_diary', { code: 'a000001' }, { data, today: '2026-10-28' }).ok,
    ).toBe(true)
  })

  it('预设新增只认人名/地名', () => {
    expect(buildAssistantAction('add_preset', { kind: 'person', name: '小王' }, ctx).ok).toBe(true)
    expect(buildAssistantAction('add_preset', { kind: 'tag', name: '小王' }, ctx).ok).toBe(false)
  })

  it('记忆按原文改删，一句话定位', () => {
    const memories = [
      { id: 'm_1', kind: 'preference' as const, text: '不吃香菜', createdAt: 0, updatedAt: 0, source: 'user' as const },
      { id: 'm_2', kind: 'goal' as const, text: '目标体重 65kg', createdAt: 0, updatedAt: 0, source: 'user' as const },
    ]
    const memoryCtx = { data: emptyData(), today: '2026-10-28', memories }
    const edit = buildAssistantAction(
      'update_memory',
      { text: '不吃香菜', newText: '不吃香菜，也不吃葱' },
      memoryCtx,
    )
    expect(edit.ok).toBe(true)
    if (edit.ok && edit.action.kind === 'memoryEdit') {
      expect(edit.action.text).toBe('不吃香菜')
      expect(edit.action.newText).toBe('不吃香菜，也不吃葱')
    }
    const remove = buildAssistantAction('delete_memory', { text: '65kg' }, memoryCtx)
    expect(remove.ok).toBe(true)
    if (remove.ok && remove.action.kind === 'memoryDelete') {
      expect(remove.action.text).toBe('目标体重 65kg')
    }
    expect(
      buildAssistantAction('delete_memory', { text: '不存在' }, memoryCtx).ok,
    ).toBe(false)
  })
})

describe('训练动作', () => {
  const trainingCtx = {
    data: {
      ...emptyData(),
      trainings: [
        {
          id: 't1',
          code: 'T000001',
          dateKey: '2026-10-27',
          time: '19:00',
          kind: 'strength' as const,
          title: '推日',
          exercises: [],
          durationMin: 45,
          feeling: 4,
          note: '',
          createdAt: 0,
          updatedAt: 0,
          deletedAt: null,
        },
        {
          id: 't2',
          code: 'T000002',
          dateKey: '2026-10-28',
          time: '07:30',
          kind: 'cardio' as const,
          title: '',
          exercises: [],
          durationMin: 30,
          feeling: null,
          note: '',
          createdAt: 0,
          updatedAt: 0,
          deletedAt: null,
        },
      ],
    },
    today: '2026-10-28',
  }

  it('记训练：动作与每组数字都收下，越界数字置空', () => {
    const result = buildAssistantAction(
      'add_training',
      {
        date: '2026-10-28',
        time: '18:20',
        kind: 'strength',
        exercises: [
          {
            name: '卧推',
            muscle: 'chest',
            sets: [
              { reps: 8, weightKg: 40 },
              { reps: 6, weightKg: 10000 },
            ],
          },
        ],
        feeling: 4,
      },
      trainingCtx,
    )
    expect(result.ok).toBe(true)
    if (result.ok && result.action.kind === 'training') {
      expect(result.action).toMatchObject({ dateKey: '2026-10-28', time: '18:20', feeling: 4 })
      expect(result.action.exercises[0].sets[0]).toMatchObject({ reps: 8, weightKg: 40 })
      expect(result.action.exercises[0].sets[1].weightKg).toBeNull()
    }
  })

  it('既没有动作也没有时长就拒绝', () => {
    expect(buildAssistantAction('add_training', { exercises: [] }, trainingCtx).ok).toBe(false)
  })

  it('code 留空表示最近一次', () => {
    const remove = buildAssistantAction('delete_training', {}, trainingCtx)
    expect(remove.ok).toBe(true)
    if (remove.ok && remove.action.kind === 'trainingDelete') {
      expect(remove.action.code).toBe('T000002')
    }
    const edit = buildAssistantAction('update_training', { note: '改备注' }, trainingCtx)
    expect(edit.ok).toBe(true)
    if (edit.ok && edit.action.kind === 'trainingEdit') {
      expect(edit.action).toMatchObject({ code: 'T000002', note: '改备注' })
    }
    expect(buildAssistantAction('update_training', {}, trainingCtx).ok).toBe(false)
  })
})
