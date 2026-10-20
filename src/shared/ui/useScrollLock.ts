import { useEffect } from 'react'

/**
 * 弹窗打开时锁住内容区滚动。
 *
 * 壳层是"固定高度 + 内容区自滚"（见 AppShell），而弹窗都是 fixed 覆盖层、
 * 又挂在内容区里，所以滚轮会顺着 DOM 链把背后的页面带走（手机上尤其明显），
 * 也就是常说的"滚动穿透"。这里用计数，是为了同时开两个弹窗时不至于互相解锁。
 */
let lockCount = 0

export function useScrollLock() {
  useEffect(() => {
    lockCount += 1
    document.documentElement.classList.add('sb-scroll-locked')
    return () => {
      lockCount -= 1
      if (lockCount <= 0) {
        lockCount = 0
        document.documentElement.classList.remove('sb-scroll-locked')
      }
    }
  }, [])
}
