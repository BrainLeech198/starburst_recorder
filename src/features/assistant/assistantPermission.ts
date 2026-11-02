/**
 * 助手能对记录做什么：只读、改前确认、新增自动保存。
 *
 * 这一层只管「给不给工具、要不要确认」，不碰数据库；
 * 修改与删除即便选了「新增自动保存」也要过一遍确认，避免一句话覆盖记录。
 */
export type AssistantPermission = 'readonly' | 'confirm' | 'auto'

const KEY = 'sb_assistant_permission_v1'

export function loadPermission(): AssistantPermission {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (raw === 'readonly' || raw === 'confirm' || raw === 'auto') return raw
  } catch {
    // 隐私模式读不了就按默认
  }
  return 'confirm'
}

export function savePermission(permission: AssistantPermission) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, permission)
  } catch {
    // 存不了就只在本次生效
  }
}

/** 只读档不给任何写工具，新增也不行 */
export function canWrite(permission: AssistantPermission) {
  return permission !== 'readonly'
}

/** 只有明确列在这里的纯新增动作可在「新增自动保存」档免确认。 */
const AUTO_CREATE_KINDS = new Set([
  'memory', 'finance', 'stamp', 'diary', 'intake',
  'foodCreate', 'mealCreate', 'presetCreate', 'training',
])

/** 只用于生成准确的删除提示；确认策略由上面的新增白名单决定。 */
const DELETE_KINDS = new Set([
  'scheduleDelete',
  'profileDelete',
  'financeDelete', 'stampDelete', 'intakeDelete', 'sleepDelete', 'diaryDelete',
  'weighDelete', 'foodDelete', 'mealDelete', 'presetDelete', 'trainingDelete', 'memoryDelete',
])

export function isDeleteKind(kind: string) {
  return DELETE_KINDS.has(kind)
}

/** 这一档下，这条动作是不是可以不经确认直接执行 */
export function runsWithoutConfirm(permission: AssistantPermission, kind: string) {
  return permission === 'auto' && AUTO_CREATE_KINDS.has(kind)
}
