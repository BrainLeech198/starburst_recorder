/**
 * 助手能对记录做什么：只读、改前确认、直接改。
 *
 * 这一层只管「给不给工具、要不要确认」，不碰数据库；
 * 删除类动作即便选了「直接改」也要过一遍确认，避免一句话把记录删掉。
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

/** 删除类动作永远要确认，哪怕开了「直接改」 */
export function isDeleteKind(kind: string) {
  return kind.endsWith('Delete')
}

/** 这一档下，这条动作是不是可以不经确认直接执行 */
export function runsWithoutConfirm(permission: AssistantPermission, kind: string) {
  return permission === 'auto' && canWrite(permission) && !isDeleteKind(kind)
}
