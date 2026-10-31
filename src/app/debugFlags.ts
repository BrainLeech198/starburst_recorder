/**
 * 悬浮球开关。
 *
 * 助手已经能真正对话，悬浮球默认显示；早期「它只是个占位」的临时隐藏已经撤掉。
 * 想临时藏起来：
 *   1. 地址后加参数：`?ball=0`（只对这次打开有效）
 *   2. 或在控制台执行：`localStorage.setItem('starburst.debug.ball', '0')`（之后刷新）
 * 恢复显示：删掉 `starburst.debug.ball` 或设回 `1`。
 */

const BALL_KEY = 'starburst.debug.ball'

export function ballVisible(): boolean {
  // 地址参数优先：贴一次链接就能临时关掉，不用先开控制台
  if (new URLSearchParams(window.location.search).get('ball') === '0') return false
  try {
    return localStorage.getItem(BALL_KEY) !== '0'
  } catch {
    // 隐私模式下 localStorage 会抛错，默认照常显示
    return true
  }
}
