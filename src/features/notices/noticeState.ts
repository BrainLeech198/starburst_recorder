/**
 * 公告的本地状态：记住「哪些公告用户明确确认收到」。
 *
 * 关闭弹窗只代表暂缓，不代表已经收到；下次启动仍会显示。
 * 普通和紧急公告都由用户点「确认收到」后记入 ids，同一设备不再弹出。
 * 旧版紧急公告已累计到上限的计数继续保留静默，避免升级后把已停止提醒的旧公告重新弹出。
 *
 * 状态只在本机，不进备份：换一台设备后「我确认收到哪条公告」没有意义，
 * 新设备上尚未确认的公告本来就该提醒一次。
 */
const SEEN_KEY = 'starburst.noticeSeen'

/** 旧版本累计关闭次数的兼容上限；新版本只在明确确认后停止提醒 */
const URGENT_REPEAT_LIMIT = 5

function readSeen(): { ids: string[]; urgentCounts: Record<string, number> } {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return { ids: [], urgentCounts: {} }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { ids: [], urgentCounts: {} }
    const record = parsed as { ids?: unknown; urgentCounts?: unknown }
    const ids = Array.isArray(record.ids)
      ? record.ids.filter((item): item is string => typeof item === 'string')
      : []
    const urgentCounts: Record<string, number> = {}
    if (record.urgentCounts && typeof record.urgentCounts === 'object') {
      for (const [key, value] of Object.entries(record.urgentCounts)) {
        if (typeof value === 'number' && Number.isFinite(value)) urgentCounts[key] = value
      }
    }
    return { ids, urgentCounts }
  } catch {
    return { ids: [], urgentCounts: {} }
  }
}

function writeSeen(state: { ids: string[]; urgentCounts: Record<string, number> }): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(state))
  } catch {
    // 隐私模式存不了：下次进来还会再显示，功能本身不受影响
  }
}

/** 这条公告还要不要显示 */
export function shouldShowNotice(
  notice: { id: string; level: string },
  state = readSeen(),
): boolean {
  if (state.ids.includes(notice.id)) return false
  if (notice.level === 'urgent') {
    const count = state.urgentCounts[notice.id] ?? 0
    return count < URGENT_REPEAT_LIMIT
  }
  return true
}

/** 记下「这条我确认收到」 */
export function acknowledgeNotice(notice: { id: string; level: string }): void {
  const state = readSeen()
  if (state.ids.includes(notice.id)) return
  state.ids.push(notice.id)
  delete state.urgentCounts[notice.id]
  // 只留最近的一批，看过的旧公告不用一直占着
  if (state.ids.length > 100) state.ids = state.ids.slice(-100)
  writeSeen(state)
}

/**
 * 从公告列表里挑出要显示的那一条。
 *
 * 紧急公告优先：普通公告压着紧急公告不放，用户可能永远看不到要紧的那条。
 */
export function pickNoticeToShow<T extends { id: string; level: string }>(
  notices: T[],
  state = readSeen(),
): T | null {
  const urgent = notices.filter((notice) => notice.level === 'urgent')
  for (const notice of urgent) {
    if (shouldShowNotice(notice, state)) return notice
  }
  for (const notice of notices) {
    if (notice.level !== 'urgent' && shouldShowNotice(notice, state)) return notice
  }
  return null
}
