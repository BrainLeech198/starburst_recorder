/**
 * 复制文本：优先 Clipboard API，老 WebView（部分安卓定制壳）没有或拒绝时退回 textarea。
 *
 * 安卓 WebView 里 `navigator.clipboard.writeText` 在非安全上下文、无焦点或系统限制下
 * 会直接抛错——不能一律假设它可用，否则「复制回答」在手机上就是一句失败提示。
 * 助手消息、代码块都走这一处，别再各自写一份。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走兜底
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '0'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    // 只读文本域在部分移动端浏览器里要显式给选区才能复制
    area.setSelectionRange(0, area.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
