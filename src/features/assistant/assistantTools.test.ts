import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import type {
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthFood,
  HealthIntake,
  HealthProfile,
  HealthSleep,
  ScheduleItem,
} from '@/core/db/schema'
import { resolveRange, runAssistantTool } from './assistantTools'

function emptyData(): BackupData {
  return {
    entries: [],
    stamps: [],
    days: [],
    presets: [],
    schedules: [],
    profile: null,
    foods: [],
    meals: [],
    intakes: [],
    sleeps: [],
    trainings: [],
    finance: [],
  }
}

describe('data_inventory', () => {
  it('覆盖整库分类并区分有效记录与回收站', () => {
    const data = emptyData()
    data.entries.push(entry('2026-10-27', '有效'), { ...entry('2026-10-26', '已删', 'a000002'), deletedAt: 1 })
    data.days.push({ dateKey: '2026-10-27', weather: '晴', updatedAt: 0 })
    data.profile = profile({ weighIns: [{ dateKey: '2026-10-27', weightKg: 70, createdAt: 0 }] })
    const text = runAssistantTool('data_inventory', {}, { data, today: '2026-10-28', memories: [] })
    expect(text).toContain('日记 1 / 1')
    expect(text).toContain('日程 0 / 0')
    expect(text).toContain('天气 1')
    expect(text).toContain('身体档案 1；称重史 1')
    expect(text).not.toContain('已删')
  })
})

describe('browse_records', () => {
  it('分页遍历全部记录，并把回收站与有效记录分开', () => {
    const data = emptyData()
    for (let day = 1; day <= 7; day += 1) {
      data.entries.push(entry(`2026-10-${String(day).padStart(2, '0')}`, `第${day}篇`, `a00000${day}`))
    }
    data.entries.push({ ...entry('2026-10-08', '回收站', 'a000008'), deletedAt: 1 })
    const ctx = { data, today: '2026-10-28' }
    const first = runAssistantTool('browse_records', { kind: 'diary' }, ctx)
    expect(first).toContain('共 7 条，第 1/2 页')
    expect(first).toContain('第7篇')
    expect(first).not.toContain('第2篇')
    expect(first).toContain('page=2')
    const second = runAssistantTool('browse_records', { kind: 'diary', page: 2 }, ctx)
    expect(second).toContain('第2篇')
    expect(second).toContain('第1篇')
    const trashed = runAssistantTool('browse_records', { kind: 'diary', trash: true }, ctx)
    expect(trashed).toContain('回收站')
    expect(trashed).not.toContain('第7篇')
  })

  it('拒绝无效类别与页码', () => {
    const ctx = { data: emptyData(), today: '2026-10-28' }
    expect(runAssistantTool('browse_records', { kind: 'bad' }, ctx)).toContain('类别不认识')
    expect(runAssistantTool('browse_records', { kind: 'diary', page: 0 }, ctx)).toContain('页码必须')
  })

  it('长期记忆也能分页读取', () => {
    const memories = Array.from({ length: 6 }, (_, index) => ({
      id: `memory-${index}`, kind: 'fact' as const, text: `事实${index}`,
      createdAt: index, updatedAt: index, source: 'assistant' as const,
    }))
    const ctx = { data: emptyData(), today: '2026-10-28', memories }
    expect(runAssistantTool('browse_records', { kind: 'memory', page: 2 }, ctx)).toContain('事实5')
    expect(runAssistantTool('read_record', { kind: 'memory', ref: 'memory-5' }, ctx)).toContain('事实5')
  })

  it('身体档案能从目录找到并继续读取', () => {
    const data = emptyData()
    data.profile = profile({ note: '膝盖旧伤' })
    const ctx = { data, today: '2026-10-28' }
    expect(runAssistantTool('browse_records', { kind: 'profile' }, ctx)).toContain('身体档案 [me]')
    expect(runAssistantTool('read_record', { kind: 'profile', ref: 'me' }, ctx)).toContain('膝盖旧伤')
  })
})

describe('read_record', () => {
  it('长正文可分段读完，图片编码不进入工具结果', () => {
    const data = emptyData()
    data.entries.push({
      ...entry('2026-10-27', `${'甲'.repeat(1800)}结尾`),
      images: [{ id: 'image-1', dataUrl: 'data:image/png;base64,SECRET_IMAGE_BYTES', width: 10, height: 20 }],
    })
    const ctx = { data, today: '2026-10-28' }
    const first = runAssistantTool('read_record', { kind: 'diary', ref: 'a000001' }, ctx)
    expect(first).toContain('offset=1700')
    const second = runAssistantTool('read_record', { kind: 'diary', ref: 'a000001', offset: 1700 }, ctx)
    expect(second).toContain('结尾')
    expect(second).toContain('图片内容省略')
    expect(first + second).not.toContain('SECRET_IMAGE_BYTES')
  })

  it('默认不读取回收站，且拒绝非法续读位置', () => {
    const data = emptyData()
    data.entries.push({ ...entry('2026-10-27', '旧文'), deletedAt: 1 })
    const ctx = { data, today: '2026-10-28' }
    expect(runAssistantTool('read_record', { kind: 'diary', ref: 'a000001' }, ctx)).toContain('找不到')
    expect(runAssistantTool('read_record', { kind: 'diary', ref: 'a000001', trash: true }, ctx)).toContain('旧文')
    expect(runAssistantTool('read_record', { kind: 'diary', ref: 'a000001', offset: -1 }, ctx)).toContain('非负整数')
  })
})

function entry(dateKey: string, content: string, code = 'a000001'): DiaryEntry {
  return {
    id: `e_${code}`,
    code,
    dateKey,
    createdAt: 0,
    updatedAt: 0,
    content,
    images: [],
    tags: [],
    deletedAt: null,
  }
}

function stamp(dateKey: string, time: string, content: string): DiaryStamp {
  return {
    id: `s_${time}`,
    code: 'b000001',
    dateKey,
    time,
    content,
    images: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function intake(dateKey: string, time: string, name: string, kcal: number): HealthIntake {
  return {
    id: `i_${dateKey}_${time}`,
    code: 'c000001',
    dateKey,
    time,
    foodId: null,
    name,
    grams: 100,
    kcal,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: 'manual',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function sleep(
  dateKey: string,
  bedtime: string,
  wakeTime: string,
  quality: number | null,
): HealthSleep {
  return {
    id: `sl_${dateKey}`,
    code: 'd000001',
    dateKey,
    bedtime,
    wakeTime,
    quality,
    wakeEvents: [],
    naps: [],
    wakeCount: null,
    wakeMinutes: null,
    note: '',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function finance(dateKey: string, name: string, amount: number, note = ''): FinanceEntry {
  return {
    id: `f_${name}`,
    code: 'f000001',
    dateKey,
    time: '12:00:00',
    kind: 'expense',
    category: 'food',
    name,
    amount,
    photo: null,
    note,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function profile(overrides: Partial<HealthProfile> = {}): HealthProfile {
  return {
    id: 'me',
    sex: 'male',
    age: 30,
    heightCm: 175,
    weightKg: 70,
    weightAt: null,
    activity: 'light',
    tdee: 2000,
    targetKcal: 1800,
    proteinTarget: 120,
    plan: '',
    note: '',
    weighDay: null,
    weighTime: '07:00',
    idealBedtime: '23:00',
    idealWakeTime: '07:00',
    weighIns: [],
    updatedAt: 0,
    ...overrides,
  }
}

describe('resolveRange', () => {
  it('缺省是最近 7 天', () => {
    expect(resolveRange('', '', '2026-10-28')).toEqual({
      from: '2026-10-22',
      to: '2026-10-28',
    })
  })

  it('结束日期晚于今天就收到今天', () => {
    expect(resolveRange('2026-10-01', '2027-01-01', '2026-10-28')).toEqual({
      from: '2026-10-01',
      to: '2026-10-28',
    })
  })

  it('开始日期太早时按上限砍掉', () => {
    expect(resolveRange('2000-01-01', '2026-10-28', '2026-10-28').from).toBe('2025-10-28')
  })

  it('开始日期晚于结束时从结束日期往前推 7 天', () => {
    expect(resolveRange('2026-10-28', '2026-10-01', '2026-10-28')).toEqual({
      from: '2026-09-25',
      to: '2026-10-01',
    })
  })

  it('日期格式不对时退回今天', () => {
    expect(resolveRange('2026/10/01', 'abc', '2026-10-28')).toEqual({
      from: '2026-10-22',
      to: '2026-10-28',
    })
  })
})

describe('query_day', () => {
  it('把一天的天气、日记、随记、摄入、睡眠都串起来', () => {
    const data = emptyData()
    data.days.push({ dateKey: '2026-10-27', weather: '晴', updatedAt: 0 })
    data.entries.push(entry('2026-10-27', '今天去爬山', 'a000001'))
    data.stamps.push(stamp('2026-10-27', '18:30', '在山顶吃了面包'))
    data.intakes.push(
      intake('2026-10-27', '12:00', '米饭', 500),
      intake('2026-10-27', '18:00', '面包', 300),
    )
    data.sleeps.push(sleep('2026-10-27', '23:00', '07:00', 4))

    const text = runAssistantTool('query_day', { date: '2026-10-27' }, { data, today: '2026-10-28' })
    expect(text).toContain('天气：晴')
    expect(text).toContain('今天去爬山')
    expect(text).toContain('在山顶吃了面包')
    expect(text).toContain('合计 800 千卡')
    expect(text).toContain('8 小时 0 分')
    expect(text).toContain('质量 4/5')
  })

  it('软删除和空正文都不算', () => {
    const data = emptyData()
    const deleted = entry('2026-10-27', '删掉的日记')
    deleted.deletedAt = 1
    data.entries.push(deleted, entry('2026-10-27', '   ', 'a000002'))

    const text = runAssistantTool('query_day', { date: '2026-10-27' }, { data, today: '2026-10-28' })
    expect(text).not.toContain('删掉的日记')
    expect(text).toContain('这一天没有任何记录。')
  })

  it('日期格式不对时给一句人话', () => {
    const text = runAssistantTool('query_day', { date: '10-27' }, { data: emptyData(), today: '2026-10-28' })
    expect(text).toContain('YYYY-MM-DD')
  })
})

describe('search_diary / search_stamps', () => {
  it('按关键词过滤，区间外的不要', () => {
    const data = emptyData()
    data.entries.push(
      entry('2026-10-27', '周末去爬山', 'a000001'),
      entry('2026-10-20', '上次爬山是十月', 'a000002'),
      entry('2026-10-27', '今天做了饭', 'a000003'),
    )
    const text = runAssistantTool(
      'search_diary',
      { from: '2026-10-22', to: '2026-10-28', keyword: '爬山' },
      { data, today: '2026-10-28' },
    )
    expect(text).toContain('周末去爬山')
    expect(text).not.toContain('上次爬山是十月')
    expect(text).not.toContain('今天做了饭')
  })

  it('没有命中时直说没有', () => {
    const text = runAssistantTool(
      'search_diary',
      { from: '2026-10-22', to: '2026-10-28', keyword: '冲浪' },
      { data: emptyData(), today: '2026-10-28' },
    )
    expect(text).toContain('没有符合条件的日记')
  })

  it('随记带出具体时刻', () => {
    const data = emptyData()
    data.stamps.push(stamp('2026-10-27', '09:15', '开完周会'))
    const text = runAssistantTool(
      'search_stamps',
      { from: '2026-10-27', to: '2026-10-27', keyword: '周会' },
      { data, today: '2026-10-28' },
    )
    expect(text).toContain('09:15')
    expect(text).toContain('开完周会')
  })
})

describe('search_schedules', () => {
  it('按日程页的重复与完成规则展开每周任务，并跳过回收站', () => {
    const data = emptyData()
    const monday: ScheduleItem = {
      id: 'schedule-1', code: 'd000001', dateKey: '2026-11-02', time: '09:00',
      title: '周会', note: '带周报', repeat: 'weekly', weeklyDays: [1], remind: false,
      doneAt: null, doneDays: ['2026-11-02'], createdAt: 0, updatedAt: 0, deletedAt: null,
    }
    data.schedules.push(monday, { ...monday, id: 'schedule-2', code: 'd000002', title: '已删除', deletedAt: 1 })

    const text = runAssistantTool('search_schedules',
      { from: '2026-11-02', to: '2026-11-10', keyword: '周报' },
      { data, today: '2026-11-10' })
    expect(text).toContain('2026年11月2日 09:00 周会（已完成）')
    expect(text).toContain('2026年11月9日 09:00 周会（未完成）')
    expect(text).not.toContain('2026年11月3日')
    expect(text).not.toContain('已删除')
    const day = runAssistantTool('query_day', { date: '2026-11-09' }, { data, today: '2026-11-10' })
    expect(day).toContain('日程：')
    expect(day).toContain('周会（未完成）')
  })

  it('未来日程可查询，供后续编辑或删除取得短编号', () => {
    const data = emptyData()
    data.schedules.push({
      id: 'future-1', code: 'd000009', dateKey: '2026-12-01', time: '',
      title: '复诊', note: '', repeat: 'none', weeklyDays: [], remind: false,
      doneAt: null, doneDays: [], createdAt: 0, updatedAt: 0, deletedAt: null,
    })
    const text = runAssistantTool('search_schedules',
      { from: '2026-12-01', to: '2026-12-01' },
      { data, today: '2026-11-02' })
    expect(text).toContain('复诊')
    expect(text).toContain('[d000009]')
  })
})

describe('统计类工具', () => {
  it('摄入给出逐日合计和日均', () => {
    const data = emptyData()
    data.intakes.push(
      intake('2026-10-26', '12:00', '米饭', 500),
      intake('2026-10-26', '18:00', '鸡胸', 300),
      intake('2026-10-27', '12:00', '面条', 1000),
    )
    const text = runAssistantTool('intake_stats', {}, { data, today: '2026-10-28' })
    expect(text).toContain('合计 1800 千卡')
    expect(text).toContain('日均 900 千卡')
    expect(text).toContain('2026-10-26 800 千卡')
    expect(text).toContain('2026-10-27 1000 千卡')
    expect(text).toContain('米饭（1 次）')
  })

  it('睡眠给出平均时长与质量', () => {
    const data = emptyData()
    data.sleeps.push(
      sleep('2026-10-26', '23:00', '07:00', 4),
      sleep('2026-10-27', '00:00', '07:00', 3),
    )
    const text = runAssistantTool('sleep_stats', {}, { data, today: '2026-10-28' })
    expect(text).toContain('2 夜')
    expect(text).toContain('7 小时 30 分')
    expect(text).toContain('平均质量 3.5/5')
  })

  it('收支可按关键词过滤', () => {
    const data = emptyData()
    data.finance.push(
      finance('2026-10-27', '午饭', 30),
      finance('2026-10-27', '打车', 20, '去公司'),
    )
    const all = runAssistantTool('finance_stats', {}, { data, today: '2026-10-28' })
    expect(all).toContain('合计 50 元')

    const filtered = runAssistantTool(
      'finance_stats',
      { keyword: '公司' },
      { data, today: '2026-10-28' },
    )
    expect(filtered).toContain('打车')
    expect(filtered).not.toContain('午饭')
    expect(filtered).toContain('合计 20 元')
  })

  it('经济图表沿用页面的分类占比和月度汇总，排除回收站', () => {
    const data = emptyData()
    data.finance.push(
      finance('2026-10-02', '午饭', 30),
      { ...finance('2026-10-03', '地铁', 20), category: 'transport' },
      { ...finance('2026-09-20', '工资', 100), kind: 'income', category: 'salary' },
      { ...finance('2026-10-04', '已删除', 500), deletedAt: 1 },
    )
    const text = runAssistantTool('finance_chart', { month: '2026-10' }, { data, today: '2026-10-28' })
    expect(text).toContain('food 30 元（60%）')
    expect(text).toContain('transport 20 元（40%）')
    expect(text).toContain('2026-09 收入 100 元，支出 0 元，结余 100 元')
    expect(text).toContain('2026-10 收入 0 元，支出 50 元，结余 -50 元')
    expect(text).not.toContain('500 元')
    expect(runAssistantTool('finance_chart', { month: '2026-13' }, { data, today: '2026-10-28' }))
      .toContain('月份格式不对')
  })

  it('身体档案带出称重变化', () => {
    const data = emptyData()
    data.profile = profile({
      weighIns: [
        { dateKey: '2026-10-01', weightKg: 70, createdAt: 0 },
        { dateKey: '2026-10-08', weightKg: 69.5, createdAt: 0 },
      ],
    })
    const text = runAssistantTool('profile_stats', {}, { data, today: '2026-10-28' })
    expect(text).toContain('性别：男')
    expect(text).toContain('目标热量：1800 千卡')
    expect(text).toContain('理想作息：23:00 → 07:00')
    expect(text).toContain('2026-10-08 69.5 kg')
    expect(text).toContain('共变化 -0.5 kg')
  })

  it('体重图沿用页面的日期范围与回归摘要，未来日期不入图', () => {
    const data = emptyData()
    data.profile = profile({
      weighIns: [
        { dateKey: '2026-10-01', weightKg: 70, createdAt: 0 },
        { dateKey: '2026-10-20', weightKg: 69, createdAt: 0 },
        { dateKey: '2026-10-27', weightKg: 68, createdAt: 0 },
        { dateKey: '2026-10-29', weightKg: 80, createdAt: 0 },
      ],
    })
    const text = runAssistantTool('weight_chart', { days: 30 }, { data, today: '2026-10-28' })
    expect(text).toContain('3 个点')
    expect(text).toContain('首尾变化 -2 kg')
    expect(text).toContain('每周趋势：')
    expect(text).toContain('2026-10-27 68 kg')
    expect(text).not.toContain('2026-10-29')
    expect(runAssistantTool('weight_chart', { days: 6 }, { data, today: '2026-10-28' }))
      .toContain('只能选 7、30 或 90 天')
  })

  it('健康区间概览只按有记录的天和夜计算，与趋势页口径一致', () => {
    const data = emptyData()
    data.profile = profile({ proteinTarget: 120, weighIns: [] })
    data.intakes.push(
      intake('2026-10-26', '12:00', '米饭', 800),
      intake('2026-10-27', '12:00', '面条', 1000),
      { ...intake('2026-10-28', '12:00', '已删', 5000), deletedAt: 1 },
    )
    data.sleeps.push(
      sleep('2026-10-26', '23:00', '07:00', 4),
      sleep('2026-10-27', '00:00', '07:00', 3),
    )
    const text = runAssistantTool('health_overview_chart', { days: 7 }, { data, today: '2026-10-28' })
    expect(text).toContain('日均摄入：900 千卡（有记录 2 天）')
    expect(text).toContain('日均睡眠：7.5 小时（有记录 2 夜')
    expect(text).toContain('蛋白达标：0/2 天')
    expect(text).toContain('推算 TDEE：数据不足')
    expect(text).not.toContain('5000')
  })

  it('月度回顾使用有效记录的每日计数和页面汇总口径', () => {
    const data = emptyData()
    data.entries.push(entry('2026-10-02', '日记'))
    data.stamps.push(stamp('2026-10-02', '10:00', '随记'))
    data.finance.push(finance('2026-10-03', '午饭', 30))
    data.sleeps.push(sleep('2026-10-03', '23:00', '07:00', 4))
    data.profile = profile({ weighIns: [{ dateKey: '2026-10-03', weightKg: 70, createdAt: 0 }] })
    data.entries.push({ ...entry('2026-10-04', '已删', 'a000002'), deletedAt: 1 })
    const text = runAssistantTool('month_review_chart', { month: '2026-10' }, { data, today: '2026-10-28' })
    expect(text).toContain('有记录 2 天，日记 1 篇，随记 1 条')
    expect(text).toContain('支出 30 元，结余 -30 元')
    expect(text).toContain('睡眠：1 夜，平均 480 分钟')
    expect(text).toContain('02:2、03:3')
    expect(text).not.toContain('04:')
  })

  it('没有档案时直说', () => {
    const text = runAssistantTool('profile_stats', {}, { data: emptyData(), today: '2026-10-28' })
    expect(text).toContain('还没有填写身体档案')
  })
})

function food(name: string, id = 'food_1'): HealthFood {
  return {
    id,
    code: 'a000001',
    name,
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
  }
}

describe('search_food', () => {
  it('按名字过滤，带出 foodId 与每 100g 营养', () => {
    const data = emptyData()
    data.foods.push(food('鸡胸肉'), food('米饭', 'food_2'))
    const text = runAssistantTool('search_food', { keyword: '鸡' }, { data, today: '2026-10-28' })
    expect(text).toContain('鸡胸肉')
    expect(text).toContain('foodId=food_1')
    expect(text).toContain('133 千卡')
    expect(text).not.toContain('米饭')
  })

  it('没有命中时直说', () => {
    const text = runAssistantTool(
      'search_food',
      { keyword: '火锅' },
      { data: emptyData(), today: '2026-10-28' },
    )
    expect(text).toContain('没有名字含')
  })
})

describe('search_meals / list_memory', () => {
  it('套餐带出 mealId 和按克数换算的营养', () => {
    const data = emptyData()
    data.foods.push(food('鸡胸肉'))
    data.meals.push({
      id: 'meal_1',
      name: '鸡胸饭',
      items: [{ foodId: 'food_1', grams: 150 }],
      photo: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    const text = runAssistantTool('search_meals', { keyword: '鸡' }, { data, today: '2026-10-28' })
    expect(text).toContain('鸡胸饭')
    expect(text).toContain('mealId=meal_1')
    expect(text).toContain('200 千卡')
  })

  it('没有套餐时直说', () => {
    const text = runAssistantTool('search_meals', {}, { data: emptyData(), today: '2026-10-28' })
    expect(text).toContain('还没有套餐')
  })

  it('记忆带分类列出原文，方便改删', () => {
    const memories = [
      { id: 'm_1', kind: 'preference' as const, text: '不吃香菜', createdAt: 0, updatedAt: 0, source: 'user' as const },
      { id: 'm_2', kind: 'goal' as const, text: '目标体重 65kg', createdAt: 0, updatedAt: 0, source: 'user' as const },
    ]
    const text = runAssistantTool('list_memory', {}, { data: emptyData(), today: '2026-10-28', memories })
    expect(text).toContain('【偏好】不吃香菜')
    expect(text).toContain('【目标】目标体重 65kg')
  })

  it('没有记忆时直说', () => {
    expect(runAssistantTool('list_memory', {}, { data: emptyData(), today: '2026-10-28' })).toContain(
      '还没有记住',
    )
  })

  it('预设按人名/地名列出并带短编号', () => {
    const data = emptyData()
    data.presets.push({
      id: 'pr_1',
      code: 'f000001',
      kind: 'person',
      name: '小王',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    const text = runAssistantTool('list_presets', {}, { data, today: '2026-10-28' })
    expect(text).toContain('人名：小王 [f000001]')
  })
})

describe('执行器的兜底', () => {
  it('不认识的工具名不返回空串', () => {
    const text = runAssistantTool('drop_table', {}, { data: emptyData(), today: '2026-10-28' })
    expect(text).toContain('没有叫 drop_table 的工具')
  })

  it('结果过长时截断并带省略号', () => {
    const data = emptyData()
    const long = '这是一段很长的日记内容。'.repeat(30)
    for (let index = 0; index < 20; index++) {
      data.entries.push(entry('2026-10-27', `${long}${index}`, `a${index.toString(16).padStart(6, '0')}`))
    }
    const text = runAssistantTool(
      'search_diary',
      { from: '2026-10-27', to: '2026-10-27' },
      { data, today: '2026-10-28' },
    )
    expect(text.length).toBe(2401)
    expect(text.endsWith('…')).toBe(true)
  })

  it('training_stats 汇总次数、容量与逐次记录', () => {
    const data = emptyData()
    data.trainings.push({
      id: 't1',
      code: 'T000001',
      dateKey: '2026-10-27',
      time: '19:00',
      kind: 'strength',
      title: '推日',
      exercises: [
        {
          id: 'e1',
          name: '卧推',
          kind: 'strength',
          muscle: 'chest',
          sets: [{ reps: 8, weightKg: 40, durationSec: null, restSec: null, rpe: null }],
          durationMin: null,
          distanceKm: null,
          note: '',
        },
      ],
      durationMin: 45,
      feeling: 4,
      note: '',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    const text = runAssistantTool(
      'training_stats',
      { from: '2026-10-26', to: '2026-11-01' },
      { data, today: '2026-11-01' },
    )
    expect(text).toContain('训练 1 次')
    expect(text).toContain('卧推')
    expect(text).toContain('T000001')
  })

  it('训练周图沿用页面的周汇总与计划天数', () => {
    const data = emptyData()
    data.profile = profile({ trainingPlan: { enabled: false, weeklyDays: [1, 3, 5, 7], time: '20:00', nudgeAfterDays: 3 } })
    data.trainings.push({
      id: 't1', code: 'T000001', dateKey: '2026-10-27', time: '19:00', kind: 'strength',
      title: '推日', exercises: [], durationMin: 45, feeling: 4, note: '',
      createdAt: 0, updatedAt: 0, deletedAt: null,
    })
    const text = runAssistantTool('training_week_chart', { date: '2026-10-27' }, { data, today: '2026-10-28' })
    expect(text).toContain('2026-10-26 到 2026-11-01')
    expect(text).toContain('1/4 次（进度环 25%）')
    expect(text).toContain('2026-10-27：1 次，0 组，0 次，容量 0 kg，时长 45 分钟')
    expect(runAssistantTool('training_week_chart', { date: 'bad' }, { data, today: '2026-10-28' }))
      .toContain('日期格式不对')
  })
})
