import { describe, expect, it } from 'vitest'
import { buildBackup, emptyPayload, onlySections, readBackup, sectionSize } from './diaryBackup'
import type { BackupPayload } from './diaryBackup'

function sample(): BackupPayload {
  return {
    ...emptyPayload(),
    entries: [
      {
        id: 'e1',
        code: 'a1b2c3d',
        dateKey: '2026-10-25',
        content: '今天在公园走了三公里。',
        images: [],
        tags: [],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    stamps: [
      {
        id: 's1',
        code: 'd4e5f60',
        dateKey: '2026-10-25',
        time: '09:30',
        content: '早上去公园散步。',
        images: [],
        tags: [],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
  }
}

describe('备份读写的兼容口径', () => {
  it('自己导出的自己一定读得回来', () => {
    const file = buildBackup(sample())
    const read = readBackup(file.content)
    expect(read.ok).toBe(true)
    expect(read.payload.entries).toHaveLength(1)
    expect(read.payload.stamps).toHaveLength(1)
    expect(read.payload.entries[0].content).toBe('今天在公园走了三公里。')
    expect(read.payload.stamps[0].code).toBe('d4e5f60')
  })

  it('日程独立成块往返：重复规则与完成记录都不丢', () => {
    const payload = sample()
    payload.schedules = [
      {
        id: 'sc1',
        code: 'c0ffee1',
        dateKey: '2026-11-02',
        time: '20:00',
        title: '练腿',
        note: '',
        repeat: 'weekly',
        weeklyDays: [1, 3],
        remind: true,
        doneAt: null,
        doneDays: ['2026-11-02'],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ]

    const full = JSON.parse(buildBackup(payload).content) as {
      sections: { diary: { schedules: unknown[] }; schedule: { items: unknown[] } }
    }
    expect(full.sections.diary.schedules).toHaveLength(1)
    expect(full.sections.schedule.items).toHaveLength(1)

    const file = buildBackup(payload, '备份', ['schedule'])
    const raw = JSON.parse(file.content) as { sections: Record<string, unknown> }
    expect(raw.sections).toHaveProperty('schedule')
    expect(raw.sections).not.toHaveProperty('diary')
    const read = readBackup(file.content)
    expect(read.ok).toBe(true)
    expect(read.payload.schedules).toHaveLength(1)
    expect(read.payload.schedules[0].weeklyDays).toEqual([1, 3])
    expect(read.payload.schedules[0].remind).toBe(true)
    expect(read.payload.schedules[0].doneDays).toEqual(['2026-11-02'])
  })

  it('旧备份里归在日记块的日程仍能读回并显示为独立块', () => {
    const payload = sample()
    payload.schedules = [{
      id: 'sc-old', code: 'c0ffee1', dateKey: '2026-11-02', time: '20:00', title: '旧日程',
      note: '', repeat: 'none', weeklyDays: [], remind: false, doneAt: null, doneDays: [],
      createdAt: 1, updatedAt: 1, deletedAt: null,
    }]
    const raw = JSON.parse(buildBackup(payload).content) as {
      sections: { diary: Record<string, unknown>; schedule?: Record<string, unknown> }
    }
    raw.sections.diary.schedules = (raw.sections.schedule as { items: unknown[] }).items
    delete raw.sections.schedule

    const read = readBackup(JSON.stringify(raw))
    expect(read.ok).toBe(true)
    expect(read.payload.schedules).toHaveLength(1)
    expect(read.sections).toContain('schedule')
  })

  it('训练独立成块往返：动作与组数都不丢', () => {
    const payload = sample()
    payload.trainings = [
      {
        id: 'tr1',
        code: 'e5f6a7b',
        dateKey: '2026-11-02',
        time: '19:30',
        kind: 'strength',
        title: '推日',
        exercises: [
          {
            id: 'x1',
            name: '卧推',
            kind: 'strength',
            muscle: 'chest',
            sets: [{ reps: 8, weightKg: 60, durationSec: null, restSec: 90, rpe: 8 }],
            durationMin: null,
            distanceKm: null,
            note: '',
          },
        ],
        durationMin: 45,
        feeling: 4,
        note: '状态不错',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ]

    const full = JSON.parse(buildBackup(payload).content) as {
      sections: { health: { trainings: unknown[] }; training: { entries: unknown[] } }
    }
    expect(full.sections.health.trainings).toHaveLength(1)
    expect(full.sections.training.entries).toHaveLength(1)

    const file = buildBackup(payload, '备份', ['training'])
    const raw = JSON.parse(file.content) as { sections: Record<string, unknown> }
    expect(raw.sections).toHaveProperty('training')
    expect(raw.sections).not.toHaveProperty('health')
    const read = readBackup(file.content)
    expect(read.ok).toBe(true)
    expect(read.payload.trainings).toHaveLength(1)
    expect(read.payload.trainings[0].title).toBe('推日')
    expect(read.payload.trainings[0].exercises[0].sets).toEqual([
      { reps: 8, weightKg: 60, durationSec: null, restSec: 90, rpe: 8 },
    ])

    const legacyRaw = JSON.parse(buildBackup(payload).content) as {
      sections: { health: Record<string, unknown>; training?: Record<string, unknown> }
    }
    delete legacyRaw.sections.training
    const legacyRead = readBackup(JSON.stringify(legacyRaw))
    expect(legacyRead.ok).toBe(true)
    expect(legacyRead.sections).toContain('training')
    expect(legacyRead.payload.trainings).toHaveLength(1)
  })

  it('日程和训练独立判断空块并独立筛选', () => {
    const payload = sample()
    expect(sectionSize(payload, 'diary')).toBe(2)
    payload.schedules = [
      {
        id: 'sc1',
        code: 'c0ffee1',
        dateKey: '2026-11-02',
        time: '20:00',
        title: '练腿',
        note: '',
        repeat: 'none',
        weeklyDays: [],
        remind: false,
        doneAt: null,
        doneDays: [],
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ]
    expect(sectionSize(payload, 'diary')).toBe(2)
    expect(sectionSize(payload, 'schedule')).toBe(1)

    payload.trainings = [
      {
        id: 'tr1',
        code: 'e5f6a7b',
        dateKey: '2026-11-02',
        time: '19:30',
        kind: 'cardio',
        title: '',
        exercises: [],
        durationMin: 30,
        feeling: null,
        note: '',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ]
    expect(sectionSize(payload, 'health')).toBe(0)
    expect(sectionSize(payload, 'training')).toBe(1)
    // 只勾日记块时，日程、健康和训练一个字都不带
    const only = onlySections(payload, ['diary'])
    expect(only.trainings).toHaveLength(0)
    expect(only.schedules).toHaveLength(0)
    const scheduleOnly = onlySections(payload, ['schedule'])
    expect(scheduleOnly.schedules).toHaveLength(1)
    expect(scheduleOnly.entries).toHaveLength(0)
    expect(scheduleOnly.trainings).toHaveLength(0)
  })

  it('图片跟着备份走：导出再读回，图还是那张图', () => {
    const payload = sample()
    const photo = { id: 'img1', dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 }
    payload.entries[0].images = [photo]
    payload.stamps[0].images = [photo]

    const read = readBackup(buildBackup(payload).content)
    expect(read.ok).toBe(true)
    expect(read.payload.entries[0].images).toEqual([photo])
    expect(read.payload.stamps[0].images).toEqual([photo])
  })

  it('图片 id 缺失或不是 dataURL 的，剔掉图但保留正文', () => {
    const payload = sample()
    payload.entries[0].images = [
      { id: '', dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 },
      { id: 'img2', dataUrl: 'https://example.com/a.png', width: 10, height: 10 },
    ]
    const read = readBackup(buildBackup(payload).content)
    expect(read.payload.entries).toHaveLength(1)
    expect(read.payload.entries[0].images).toEqual([])
    expect(read.skipped).toBe(0)
  })

  it('导出的文件带上两个版本号，方便以后定位', () => {
    const parsed = JSON.parse(buildBackup(sample()).content) as Record<string, unknown>
    expect(parsed.app).toBe('starburst-recorder')
    expect(parsed.version).toBe(2)
    expect(parsed.schemaVersion).toBe(2)
  })

  it('v1 那种扁平摆法照样读得出来', () => {
    const legacy = JSON.stringify({
      app: 'starburst-recorder',
      version: 1,
      entries: [{ id: 'e1', dateKey: '2026-10-25', content: '旧版的一条' }],
    })
    const read = readBackup(legacy)
    expect(read.ok).toBe(true)
    expect(read.payload.entries[0].content).toBe('旧版的一条')
  })

  it('版本号看不懂也照样读：只认字段，不认版本', () => {
    const future = JSON.stringify({
      app: 'starburst-recorder',
      version: 99,
      schemaVersion: 99,
      totallyUnknownTopLevel: { anything: true },
      sections: {
        diary: {
          entries: [{ id: 'e1', dateKey: '2026-10-25', content: '还在', brandNewField: 1 }],
        },
      },
    })
    const read = readBackup(future)
    expect(read.ok).toBe(true)
    expect(read.payload.entries[0].content).toBe('还在')
    expect('brandNewField' in (read.payload.entries[0] as object)).toBe(false)
  })

  it('写坏的日期不进库：2026-13-40 这种会静默污染统计', () => {
    const broken = JSON.stringify({
      app: 'starburst-recorder',
      version: 2,
      sections: {
        diary: {
          entries: [
            { id: 'good', dateKey: '2026-10-25', content: '好的' },
            { id: 'bad', dateKey: '2026-13-40', content: '坏日期' },
          ],
        },
      },
    })
    const read = readBackup(broken)
    expect(read.ok).toBe(true)
    expect(read.payload.entries).toHaveLength(1)
    expect(read.payload.entries[0].id).toBe('good')
    expect(read.skipped).toBeGreaterThan(0)
  })

  it('整份都认不出来时说人话，不抛异常', () => {
    expect(readBackup('not json at all').ok).toBe(false)
    expect(readBackup('[]').ok).toBe(false)
    expect(readBackup('{}').ok).toBe(false)
  })
})
