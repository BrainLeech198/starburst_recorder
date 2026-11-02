import { describe, expect, it } from 'vitest'
import { runsWithoutConfirm } from './assistantPermission'

describe('助手新增自动保存权限', () => {
  it('只允许明确的新增动作跳过确认', () => {
    expect(runsWithoutConfirm('auto', 'diary')).toBe(true)
    expect(runsWithoutConfirm('auto', 'finance')).toBe(true)
    for (const kind of ['weatherEdit', 'sleepEdit', 'profileCreate', 'profileEdit', 'profileDelete', 'weigh', 'weighEdit', 'sleep', 'diaryDelete', 'scheduleEdit', 'scheduleDelete', 'unknown']) {
      expect(runsWithoutConfirm('auto', kind)).toBe(false)
    }
  })

  it('只读和确认档所有动作都要走确认或禁止写入', () => {
    expect(runsWithoutConfirm('readonly', 'diary')).toBe(false)
    expect(runsWithoutConfirm('confirm', 'diary')).toBe(false)
  })
})
