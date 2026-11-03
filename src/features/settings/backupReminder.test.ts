import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKUP_REMIND_DAYS,
  daysSince,
  daysSinceBackup,
  formatBackupDate,
  lastBackupAt,
  markBackupDone,
  shouldRemindBackup,
} from './backupReminder'

const store = new Map<string, string>()

/** 固定的「现在」，避免用例依赖真实时钟 */
const NOW = new Date(2026, 10, 3, 12, 0, 0).getTime()
const DAY = 86_400_000

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('备份提醒', () => {
  it('从没导出过：没有时间戳，但应该提醒', () => {
    expect(lastBackupAt()).toBeNull()
    expect(daysSinceBackup(NOW)).toBeNull()
    expect(shouldRemindBackup(NOW)).toBe(true)
  })

  it('刚导出过：当天算 0 天，不提醒', () => {
    markBackupDone(NOW)
    expect(lastBackupAt()).toBe(NOW)
    expect(daysSinceBackup(NOW)).toBe(0)
    expect(shouldRemindBackup(NOW)).toBe(false)
  })

  it('到第 14 天才开始提醒，13 天不提醒', () => {
    markBackupDone(NOW - 13 * DAY)
    expect(daysSinceBackup(NOW)).toBe(13)
    expect(shouldRemindBackup(NOW)).toBe(false)

    markBackupDone(NOW - BACKUP_REMIND_DAYS * DAY)
    expect(shouldRemindBackup(NOW)).toBe(true)
  })

  it('时钟回拨（当前时间早于上次导出）按 0 天算，不出现负数', () => {
    markBackupDone(NOW + 5 * DAY)
    expect(daysSinceBackup(NOW)).toBe(0)
    expect(shouldRemindBackup(NOW)).toBe(false)
  })

  it('存了脏值当作没导出过，不抛异常', () => {
    store.set('starburst.lastBackupAt', 'abc')
    expect(lastBackupAt()).toBeNull()
    expect(shouldRemindBackup(NOW)).toBe(true)
  })

  it('localStorage 不可用（隐私模式）时静默，不影响导出本身', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => markBackupDone(NOW)).not.toThrow()
    expect(lastBackupAt()).toBeNull()
    expect(shouldRemindBackup(NOW)).toBe(true)
  })

  it('日期补零：2026-01-05 不会写成 2026-1-5', () => {
    expect(formatBackupDate(new Date(2026, 0, 5, 9, 30).getTime())).toBe('2026-01-05')
    expect(formatBackupDate(new Date(2026, 10, 3, 9, 30).getTime())).toBe('2026-11-03')
  })

  it('daysSince 是纯计算：不受存储影响', () => {
    expect(daysSince(NOW, NOW)).toBe(0)
    expect(daysSince(NOW - 3 * DAY, NOW)).toBe(3)
    expect(daysSince(NOW + DAY, NOW)).toBe(0)
  })
})
