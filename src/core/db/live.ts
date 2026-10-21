/**
 * 页面订阅数据变化的唯一入口。
 *
 * 以前这里直接转手 `dexie-react-hooks` 的 useLiveQuery：它能感知 Dexie 自己的写入，
 * 但看不见主进程里 SQLite 发生的变化。现在数据层有两种后端，所以订阅也自己实现：
 * 靠 `subscribeChanges`（由 `withChangeBus` 在每次写成功后触发）重新跑一遍查询。
 *
 * 调用方式跟原来完全一样：`useLiveQuery(() => 查询, [依赖...])`。
 * 换实现时的硬要求：写完之后页面必须能收到变化通知，并重新执行查询函数。
 */
import { useEffect, useRef, useState } from 'react'
import { subscribeChanges } from './changes'

/**
 * 依赖数组的指纹。查询函数本身每次渲染都是新的，不能拿来当依赖；
 * 真正决定「要不要重查」的是调用方传进来的依赖值。
 */
function depsKey(deps: unknown[]) {
  try {
    return JSON.stringify(deps)
  } catch {
    return deps.map((item) => String(item)).join('|')
  }
}

/**
 * 跑一次查询并在数据变化时自动重跑。
 *
 * 返回 undefined 表示「第一次还没查出来」；重查期间保留上一次的结果，
 * 避免每次写入后界面先闪一下空白——这点和 dexie-react-hooks 保持一致。
 */
export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  deps: unknown[] = [],
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  // 查询函数放进 ref：订阅回调始终用最新那份，但不必因为它变化就重订阅
  const querierRef = useRef(querier)
  const key = depsKey(deps)

  // 声明顺序有讲究：这个 effect 先跑，把最新查询函数存进去，
  // 下面的 effect 随后才会用 ref 里的新值去查。
  useEffect(() => {
    querierRef.current = querier
  })

  useEffect(() => {
    let alive = true
    // 每次重查发一个序号，慢的旧请求回来了也不许覆盖新结果
    let latest = 0

    function run() {
      const token = ++latest
      void Promise.resolve()
        .then(() => querierRef.current())
        .then((next) => {
          if (alive && token === latest) setValue(next)
        })
        .catch(() => {
          // 查询失败就保持上一次结果：页面自己会处理 undefined / 旧值
        })
    }

    run()
    const unsubscribe = subscribeChanges(run)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [key])

  return value
}
