/**
 * 公告的本地状态：记住「哪些公告已经看过」。
 *
 * **紧急公告（urgent）例外**——看过也还会再显示一次。
 * 理由很实在：紧急公告说的是「请把你之前用过的 API Key 都删掉」这种
 * 需要动手处理的事，看一眼就消失等于没看见。用户主动关掉才算看过，
 * 但下次进来还会再提醒一次，直到他明确处理过。
 *
 * 状态只在本机，不进备份：换一台设备后「我看过哪条公告」没有意义，
 * 新设备上紧急公告本来就该再提醒一次。
 */
const SEEN_KEY = 'starburst.noticeSeen'

/** 紧急公告最多提醒几次就闭嘴——别把用户烦到把应用关了 */
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
  if (notice.level === 'urgent') {
    const count = state.urgentCounts[notice.id] ?? 0
    return count < URGENT_REPEAT_LIMIT
  }
  return !state.ids.includes(notice.id)
}

/** 记下「这条我看过了」 */
export function markNoticeSeen(notice: { id: string; level: string }): void {
  const state = readSeen()
  if (notice.level === 'urgent') {
    const count = state.urgentCounts[notice.id] ?? 0
    if (count >= URGENT_REPEAT_LIMIT) return
    state.urgentCounts[notice.id] = count + 1
  } else {
    if (state.ids.includes(notice.id)) return
    state.ids.push(notice.id)
  }
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
