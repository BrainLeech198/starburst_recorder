/**
 * 页面订阅数据变化的唯一入口。
 *
 * 为什么不让页面直接 `import { useLiveQuery } from 'dexie-react-hooks'`：
 * 数据层以后要换（可选的共享/同步层，或者 SQLite），到时候该改的是**我们自己的订阅实现**，
 * 而不是去翻遍每个页面。所以页面一律从这里拿订阅，写数据一律走 diaryRepo——
 * 换存储时被牵动的只有存储实现（`core/db/dexieStore.ts`）和这个文件。
 *
 * 换实现时的硬要求：写完之后页面必须能收到变化通知，并重新执行查询函数。
 */
export { useLiveQuery } from 'dexie-react-hooks'
