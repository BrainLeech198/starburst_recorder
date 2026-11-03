/**
 * 应用里有多少条紧急公告。
 *
 * 给「我的」页那个红点用。它单独拉一次公告，**不做缓存**——
 * 公告条数是个位数，一次小请求换一份准确的数字，比维护缓存省事。
 *
 * 拉不到就当作没有公告：红点是提示，不是必须准确的功能。
 */
import { useEffect, useState } from 'react'
import { fetchNotices } from '@/platform/channel'

export function useUrgentNoticeCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    void fetchNotices().then((list) => {
      if (!alive) return
      setCount(list.filter((item) => item.level === 'urgent').length)
    })
    return () => {
      alive = false
    }
  }, [])

  return count
}
