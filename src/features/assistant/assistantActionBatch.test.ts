import { describe, expect, it } from 'vitest'
import { processAssistantActionBatch } from './assistantActionBatch'

describe('助手批量动作', () => {
  it('按顺序执行并逐项记录结果；一项失败不阻断后续项目', async () => {
    const order: string[] = []
    const settled: Array<{ index: number; ok: boolean }> = []
    const result = await processAssistantActionBatch(
      [
        { index: 2, action: 'diary' },
        { index: 4, action: 'finance' },
        { index: 5, action: 'stamp' },
      ],
      async (action) => {
        order.push(action)
        if (action === 'finance') throw new Error('余额字段不合法')
        return `${action} saved`
      },
      (index, outcome) => settled.push({ index, ok: outcome.ok }),
    )

    expect(order).toEqual(['diary', 'finance', 'stamp'])
    expect(settled).toEqual([
      { index: 2, ok: true },
      { index: 4, ok: false },
      { index: 5, ok: true },
    ])
    expect(result).toEqual({ succeeded: 2, failed: 1 })
  })

  it('空批次不执行任何动作', async () => {
    const execute = () => Promise.resolve('unexpected')
    const result = await processAssistantActionBatch([], execute, () => {
      throw new Error('should not settle')
    })
    expect(result).toEqual({ succeeded: 0, failed: 0 })
  })
})
