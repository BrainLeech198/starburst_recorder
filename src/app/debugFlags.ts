/**
 * 调试开关。默认全关，正式跑的时候一个都不生效。
 *
 * 现在只有一项：悬浮球。它当前只是个占位（点开只会说"AI 还没接入"），
 * 放在右下角既是误导、又容易被当成多出来的鼠标指针，所以平时不显示。
 *
 * 想看它怎么动：
 *   1. 地址后加参数：`http://localhost:5173/?ball=1#/diary`
 *   2. 或在控制台执行：`localStorage.setItem('starburst.debug.ball', '1')`（之后刷新）
 *   关掉：`localStorage.removeItem('starburst.debug.ball')`
 */

const BALL_KEY = 'starburst.debug.ball'

export function ballVisible(): boolean {
  // 地址参数优先：贴一次链接就能看，不用先开控制台
  if (new URLSearchParams(window.location.search).get('ball') === '1') return true
  try {
    return localStorage.getItem(BALL_KEY) === '1'
  } catch {
    // 隐私模式下 localStorage 会抛错，那就当没开
    return false
  }
}
