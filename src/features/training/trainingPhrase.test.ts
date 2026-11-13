import { describe, expect, it } from 'vitest'
import { parseTrainingPhrase } from './trainingPhrase'

const today = '2026-11-02'

describe('parseTrainingPhrase', () => {
  it('读标准 JSON，组数逐个保留', () => {
    const result = parseTrainingPhrase(
      JSON.stringify({
        dateKey: today,
        time: '19:30',
        kind: 'strength',
        title: '推日',
        exercises: [
          {
            name: '卧推',
            kind: 'strength',
            muscle: 'chest',
            sets: [
              { reps: 8, weightKg: 40 },
              { reps: 6, weightKg: 42.5 },
            ],
          },
        ],
        durationMin: 45,
        feeling: 4,
        note: '状态不错',
      }),
      today,
    )
    expect(result.ok).toBe(true)
    expect(result.training).toMatchObject({
      dateKey: today,
      time: '19:30',
      kind: 'strength',
      title: '推日',
      durationMin: 45,
      feeling: 4,
    })
    expect(result.training?.exercises[0].sets).toHaveLength(2)
    expect(result.training?.exercises[0].sets[1]).toMatchObject({ reps: 6, weightKg: 42.5 })
  })

  it('剥掉 ```json 围栏', () => {
    const reply = '```json\n{"exercises":[{"name":"深蹲","sets":[{"reps":5,"weightKg":60}]}]}\n```'
    expect(parseTrainingPhrase(reply, today)?.training?.exercises[0].name).toBe('深蹲')
  })

  it('坏 JSON 与空动作都判失败', () => {
    expect(parseTrainingPhrase('不是 JSON', today).ok).toBe(false)
    expect(parseTrainingPhrase('{"exercises":[]}', today).ok).toBe(false)
  })

  it('负重越界置 null，不静默保留脏值', () => {
    const result = parseTrainingPhrase(
      '{"exercises":[{"name":"硬拉","sets":[{"reps":5,"weightKg":10000}]}]}',
      today,
    )
    expect(result.training?.exercises[0].sets[0].weightKg).toBeNull()
  })

  it('日期非法时回退今天，时刻非法时保持未记录', () => {
    const result = parseTrainingPhrase(
      '{"dateKey":"2026-13-40","time":"25:99","exercises":[{"name":"跑步","durationMin":20}]}',
      today,
    )
    expect(result.training?.dateKey).toBe(today)
    expect(result.training?.time).toBe('')
  })

  it('缺少的名字与未知类型都收敛到安全值', () => {
    const result = parseTrainingPhrase(
      '{"exercises":[{"name":"","sets":[]},{"name":"拉伸","kind":"weird","muscle":"weird"}]}',
      today,
    )
    expect(result.training?.exercises).toHaveLength(1)
    expect(result.training?.exercises[0]).toMatchObject({ kind: 'other', muscle: 'other' })
  })
})
