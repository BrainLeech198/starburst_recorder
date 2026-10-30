import { describe, expect, it } from 'vitest'
import type { BackupData } from '@/core/db/store'
import type {
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
  HealthProfile,
  HealthSleep,
} from '@/core/db/schema'
import { resolveRange, runAssistantTool } from './assistantTools'

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

function entry(dateKey: string, content: string, code = 'a000001'): DiaryEntry {
  return {
    id: `e_${code}`,
    code,
    dateKey,
    createdAt: 0,
    updatedAt: 0,
    content,
    images: [],
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
    note: '',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }
}

function finance(dateKey: string, name: string, amount: number, note = ''): FinanceEntry {
  return {
    id: `f_${name}`,
    dateKey,
    name,
    amount,
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

  it('没有档案时直说', () => {
    const text = runAssistantTool('profile_stats', {}, { data: emptyData(), today: '2026-10-28' })
    expect(text).toContain('还没有填写身体档案')
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
})
