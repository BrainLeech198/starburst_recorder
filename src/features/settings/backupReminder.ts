/**
 * 「上次导出备份是什么时候」——只记在本机，不进备份文件。
 *
 * 为什么需要：网页版（尤其是 iOS 上添加到主屏幕的 PWA）的 IndexedDB 可能被浏览器回收，
 * 桌面与安卓不存在这个风险。但备份习惯对三个平台都有价值，所以判断逻辑不分平台，
 * 只是网页版上更该当真。
 *
 * 口径：只有**真的落盘**才记时间。用户在系统选择器里按取消、在分享面板里划走都不算——
 * 那正是 `SaveOutcome` 要把 canceled 单独拎出来的原因。
 *
 * 这条状态刻意不进备份、也不进 `userPrefs`：换一台设备之后「我上次备份是哪天」
 * 没有意义，反而会误导新设备上的提示。
 */

/** 超过这个天数就提示导出。14 天是个折中：比浏览器的清理窗口短，又不至于天天弹 */
export const BACKUP_REMIND_DAYS = 14

const KEY = 'starburst.lastBackupAt'
const DAY_MS = 86_400_000

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** 记一次成功导出。`at` 只为测试可注入，正常调用不传。 */
export function markBackupDone(at: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(at))
  } catch {
    // 隐私模式存不了：下次打开还会提示，不影响导出本身
  }
}

/** 上次导出成功的时间戳；从没导出过返回 null */
export function lastBackupAt(): number | null {
  return read()
}

/** 距离上次导出的整天数；从没导出过返回 null。同一天内、以及时钟回拨都算 0。 */
export function daysSinceBackup(now: number = Date.now()): number | null {
  const last = read()
  if (last === null) return null
  return daysSince(last, now)
}

/** 纯计算版本：给定时间戳到现在的整天数，负数按 0 处理 */
export function daysSince(at: number, now: number = Date.now()): number {
  const elapsed = now - at
  return elapsed <= 0 ? 0 : Math.floor(elapsed / DAY_MS)
}

/** 该不该提醒：从没导出过，或者已经到 / 超过 BACKUP_REMIND_DAYS 天 */
export function shouldRemindBackup(now: number = Date.now()): boolean {
  const days = daysSinceBackup(now)
  return days === null || days >= BACKUP_REMIND_DAYS
}

/** 上次导出的日期，本地时区，`YYYY-MM-DD`。日期本身不分语言，所以不进 i18n */
export function formatBackupDate(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
