/**
 * 应用里有多少条紧急公告。
 *
 * 给「我的」页那个红点用。它单独拉一次公告，**不做缓存**——
 * 公告条数是个位数，一次小请求换一份准确的数字，比维护缓存省事。
 *
 * 只在成功读到公告时显示红点；请求失败时不把未知状态当作零条紧急公告。
 */
import { useEffect, useState } from 'react'
import { fetchNotices } from '@/platform/channel'

export function useUrgentNoticeCount(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void fetchNotices().then((result) => {
      if (!alive) return
      if (result.ok) setCount((result.data ?? []).filter((item) => item.level === 'urgent').length)
    })
    return () => {
      alive = false
    }
  }, [])

  return count
}
