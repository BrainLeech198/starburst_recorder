import { describe, expect, it } from 'vitest'
import type {
  DiaryDay,
  DiaryEntry,
  DiaryStamp,
  FinanceEntry,
  HealthIntake,
} from '@/core/db/schema'
import { formatDateCn, weekdayLabel } from '@/core/utils/dateKey'
import type { BackupPayload } from '@/features/diary/diaryBackup'
import {
  buildRecordExport,
  buildSingleRecordExport,
  emptySelection,
  filterByDate,
  recordsOf,
  selectedRecords,
  selectionSize,
  toggleSelection,
} from './recordExport'

function base(overrides: Partial<BackupPayload> = {}): BackupPayload {
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
    ...overrides,
  }
}

function entry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'e1',
    code: 'a000001',
    dateKey: '2026-10-26',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    content: '今天去了公园。',
    deletedAt: null,
    ...overrides,
  }
}

function stamp(overrides: Partial<DiaryStamp> = {}): DiaryStamp {
  return {
    id: 's1',
    code: 'c000001',
    dateKey: '2026-10-26',
    time: '09:30',
    content: '晒了太阳。',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function intake(overrides: Partial<HealthIntake> = {}): HealthIntake {
  return {
    id: 'i1',
    code: 'b000001',
    dateKey: '2026-10-24',
    time: '12:10',
    foodId: null,
    name: '午饭',
    grams: 300,
    kcal: 520,
    protein: 30,
    carbs: 60,
    fat: 12,
    source: 'manual',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function finance(overrides: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: 'f1',
    dateKey: '2026-10-24',
    name: '买菜',
    amount: 18,
    note: '',
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    deletedAt: null,
    ...overrides,
  }
}

function day(overrides: Partial<DiaryDay> = {}): DiaryDay {
  return {
    dateKey: '2026-10-26',
    weather: '晴',
    updatedAt: 1790000000000,
    ...overrides,
  }
}

describe('recordsOf', () => {
  it('剔除回收站里的记录，并按日期与时刻排序', () => {
    const payload = base({
      stamps: [
        stamp({ id: 'b', dateKey: '2026-10-26', time: '18:00' }),
        stamp({ id: 'a', dateKey: '2026-10-26', time: '09:30' }),
        stamp({ id: 'c', dateKey: '2026-10-25', time: '23:00' }),
        stamp({ id: 'gone', deletedAt: 1 }),
      ],
    })

    expect(recordsOf(payload, 'stamp').map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('给摄入带上名称、时刻与营养摘要', () => {
    const item = recordsOf(base({ intakes: [intake()] }), 'intake')[0]
    expect(item.text).toBe('午饭')
    expect(item.time).toBe('12:10')
    expect(item.detail).toContain('520')
    expect(item.detail).toContain('蛋白质')
  })

  it('给收支带上名称与两位小数金额', () => {
    const item = recordsOf(base({ finance: [finance({ amount: 18.5 })] }), 'finance')[0]
    expect(item.text).toBe('买菜')
    expect(item.detail).toBe('18.50')
  })
})

describe('勾选', () => {
  it('不同类型可以混选，再点一次取消', () => {
    let selection = emptySelection()
    selection = toggleSelection(selection, 'diary', 'e1')
    selection = toggleSelection(selection, 'intake', 'i1')
    expect(selectionSize(selection)).toBe(2)

    selection = toggleSelection(selection, 'diary', 'e1')
    expect(selectionSize(selection)).toBe(1)
    expect(selection.intake).toEqual(['i1'])
  })

  it('只拿到选中的记录，没勾的不出现', () => {
    const payload = base({
      entries: [entry({ id: 'e1' }), entry({ id: 'e2', content: '另一篇。' })],
      intakes: [intake({ id: 'i1' })],
    })
    const picked = selectedRecords(payload, {
      diary: ['e2'],
      stamp: [],
      intake: ['i1'],
      sleep: [],
      finance: [],
    })
    expect(picked.map((item) => item.id)).toEqual(['e2', 'i1'])
  })

  it('按日期筛选列表，不影响勾选本身', () => {
    const items = recordsOf(
      base({
        stamps: [
          stamp({ id: 'old', dateKey: '2026-09-01' }),
          stamp({ id: 'mid', dateKey: '2026-10-20' }),
          stamp({ id: 'new', dateKey: '2026-10-26' }),
        ],
      }),
      'stamp',
    )
    expect(filterByDate(items, '2026-10-01', '2026-10-31').map((item) => item.id)).toEqual([
      'mid',
      'new',
    ])
    expect(filterByDate(items, '0000-01-01', '9999-12-31')).toHaveLength(3)
  })
})

describe('buildRecordExport 的 Markdown', () => {
  const payload = base({
    entries: [entry()],
    stamps: [stamp()],
    intakes: [intake()],
    finance: [finance()],
    days: [day()],
  })

  it('按日期分组，只写勾选的种类', () => {
    const file = buildRecordExport(payload, {
      diary: ['e1'],
      stamp: [],
      intake: [],
      sleep: [],
      finance: [],
    }, 'markdown')

    expect(file.filename.endsWith('.md')).toBe(true)
    expect(file.content).toContain(`## ${formatDateCn('2026-10-26')} ${weekdayLabel('2026-10-26')}`)
    expect(file.content).toContain('今天去了公园。')
    expect(file.content).not.toContain('晒了太阳。')
    expect(file.content).not.toContain('午饭')
    expect(file.content).not.toContain('买菜')
  })

  it('带上随记时刻、摄入营养与收支金额，日期从旧到新', () => {
    const file = buildRecordExport(
      payload,
      { diary: [], stamp: ['s1'], intake: ['i1'], sleep: [], finance: ['f1'] },
      'markdown',
    )

    expect(file.content).toContain('- 09:30 晒了太阳。')
    expect(file.content).toContain('- 12:10 午饭 · 520 kcal · 蛋白质 30 g')
    expect(file.content).toContain('- 买菜 · 18.00')
    expect(file.content.indexOf(formatDateCn('2026-10-24'))).toBeLessThan(
      file.content.indexOf(formatDateCn('2026-10-26')),
    )
  })

  it('天气跟着日记所在日期走，关掉时一个字都不写', () => {
    const on = buildRecordExport(payload, { diary: ['e1'], stamp: [], intake: [], sleep: [], finance: [] }, 'markdown')
    expect(on.content).toContain('天气：晴')

    const off = buildRecordExport(
      payload,
      { diary: ['e1'], stamp: [], intake: [], sleep: [], finance: [] },
      'markdown',
      { includeWeather: false },
    )
    expect(off.content).not.toContain('天气：')
  })

  it('只勾摄入时不写天气', () => {
    const file = buildRecordExport(
      payload,
      { diary: [], stamp: [], intake: ['i1'], sleep: [], finance: [] },
      'markdown',
    )
    expect(file.content).not.toContain('天气：')
  })
})

describe('buildRecordExport 的纯文本与 JSON', () => {
  const payload = base({
    entries: [entry()],
    stamps: [stamp()],
    intakes: [intake()],
    days: [day()],
  })
  const all = { diary: ['e1'], stamp: ['s1'], intake: ['i1'], sleep: [], finance: [] }

  it('纯文本不带 Markdown 标记，种类用方括号标出', () => {
    const file = buildRecordExport(payload, all, 'text')

    expect(file.filename.endsWith('.txt')).toBe(true)
    expect(file.content).not.toContain('# ')
    expect(file.content).toContain(
      `${formatDateCn('2026-10-26')} ${weekdayLabel('2026-10-26')}`,
    )
    expect(file.content).toContain('[日记]')
    expect(file.content).toContain('[随记]')
    expect(file.content).toContain('[健康摄入]')
  })

  it('JSON 只带选中的原始记录，字段完整', () => {
    const file = buildRecordExport(payload, all, 'json')
    const data = JSON.parse(file.content)

    expect(data.entries.map((item: DiaryEntry) => item.id)).toEqual(['e1'])
    expect(data.stamps.map((item: DiaryStamp) => item.id)).toEqual(['s1'])
    expect(data.intakes.map((item: HealthIntake) => item.id)).toEqual(['i1'])
    expect(data.entries[0].createdAt).toBe(1790000000000)
    expect(data.days).toEqual([day()])
  })

  it('回收站里的记录即使 id 被勾上也不导出', () => {
    const buried = base({ entries: [entry({ id: 'gone', deletedAt: 1 })] })
    const file = buildRecordExport(
      buried,
      { diary: ['gone'], stamp: [], intake: [], sleep: [], finance: [] },
      'json',
    )
    expect(JSON.parse(file.content).entries).toEqual([])
  })
})

describe('buildSingleRecordExport', () => {
  it('日记单条导出与整库 JSON 同构，并带上当天天气', () => {
    const row = entry()
    const file = buildSingleRecordExport('diary', row, day())
    const data = JSON.parse(file.content)

    expect(file.label).toBe('JSON')
    expect(file.mime).toBe('application/json')
    expect(file.filename.endsWith('.json')).toBe(true)
    expect(file.filename).toContain('日记')
    expect(data.app).toBe('starburst-recorder')
    expect(data.kind).toBe('records')
    expect(data.entries).toEqual([row])
    expect(data.days).toEqual([day()])
    expect(data.stamps).toBeUndefined()
    expect(data.intakes).toBeUndefined()
    expect(data.finance).toBeUndefined()
  })

  it('随记带上当天天气；摄入和收支没有 day 字段', () => {
    const s = buildSingleRecordExport('stamp', stamp(), day())
    expect(JSON.parse(s.content).stamps).toEqual([stamp()])
    expect(JSON.parse(s.content).days).toEqual([day()])

    const i = buildSingleRecordExport('intake', intake())
    expect(JSON.parse(i.content).intakes).toEqual([intake()])
    expect(JSON.parse(i.content).days).toBeUndefined()
    expect(i.filename).toContain('健康摄入')

    const f = buildSingleRecordExport('finance', finance())
    expect(JSON.parse(f.content).finance).toEqual([finance()])
    expect(f.filename).toContain('收支')
  })
})
