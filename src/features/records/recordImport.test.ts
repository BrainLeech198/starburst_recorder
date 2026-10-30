import { describe, expect, it } from 'vitest'
import { isRecordsFile, readRecordsFile, recordsCount } from './recordImport'
import { buildSingleRecordExport } from './recordExport'
import type { HealthSleep, WeighIn } from '@/core/db/schema'

const SLEEP: HealthSleep = {
  id: 's1',
  code: 'S-ab12',
  dateKey: '2026-10-29',
  bedtime: '23:10',
  wakeTime: '07:05',
  quality: 4,
  note: '',
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
}

const WEIGHT: WeighIn = { dateKey: '2026-10-28', weightKg: 70.5, createdAt: 1 }

describe('isRecordsFile', () => {
  it('只认 kind=records 的导出文件', () => {
    expect(isRecordsFile(buildSingleRecordExport('sleep', SLEEP).content)).toBe(true)
    expect(isRecordsFile('{"app":"starburst-recorder","kind":"backup"}')).toBe(false)
    expect(isRecordsFile('not json')).toBe(false)
  })
})

describe('readRecordsFile', () => {
  it('读出各数组并跳过坏行', () => {
    const text = JSON.stringify({
      app: 'starburst-recorder',
      kind: 'records',
      sleeps: [SLEEP, { id: 'bad' }],
      weights: [WEIGHT, { dateKey: 'bad-day', weightKg: -1 }],
    })
    const result = readRecordsFile(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.sleeps).toHaveLength(1)
    expect(result.file.weights).toHaveLength(1)
    expect(result.skipped).toBe(2)
    expect(recordsCount(result.file, ['sleep', 'weight'])).toBe(2)
    expect(recordsCount(result.file, ['intake'])).toBe(0)
  })

  it('不是记录导出就拒绝', () => {
    expect(readRecordsFile('not json').ok).toBe(false)
    expect(readRecordsFile('{"app":"other"}').ok).toBe(false)
  })

  it('称重按天去重，只留最新一条', () => {
    const text = JSON.stringify({
      app: 'starburst-recorder',
      kind: 'records',
      weights: [WEIGHT, { dateKey: '2026-10-28', weightKg: 71, createdAt: 2 }],
    })
    const result = readRecordsFile(text)
    expect(result.ok && result.file.weights).toHaveLength(1)
    if (result.ok) expect(result.file.weights[0].weightKg).toBe(71)
  })
})
