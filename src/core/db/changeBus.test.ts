import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { WRITE_METHODS, subscribeChanges, withChangeBus } from './changes'
import type { DiaryStore } from './store'

/** `store.ts` 里 DiaryStore 声明的全部方法名（接口成员一律两个空格缩进、紧跟左括号） */
function contractMethods(): string[] {
  const source = readFileSync(fileURLToPath(new URL('./store.ts', import.meta.url)), 'utf8')
  return [...source.matchAll(/^ {2}([a-zA-Z]\w*)[?(]/gm)].map((match) => match[1])
}

/**
 * 哪些算写操作：按动词前缀认。
 * `trashed*` 是「读回收站」而不是「扔进回收站」，只差两个字母就漏进读方法里，
 * 真把每个读查询都当成写来广播，页面会被自己刷到停不下来。
 */
const WRITE_VERB = /^(create|update|set|remove|restore|move|save|add|purge|import|replace|clear|trash|merge)([A-Z_]|$)/

function contractWriteMethods(): string[] {
  return contractMethods().filter((name) => WRITE_VERB.test(name) && !name.startsWith('trashed'))
}

describe('变更总线与 DiaryStore 契约对齐', () => {
  it('契约里的每个写方法都登记在白名单内', () => {
    // 漏登记的后果不是报错，是删完界面不收行：界面上看不出数据已经变了
    const missing = contractWriteMethods().filter((name) => !WRITE_METHODS.has(name))
    expect(missing).toEqual([])
  })

  it('白名单里不存在契约中没有的方法名', () => {
    const declared = new Set(contractMethods())
    const stale = [...WRITE_METHODS].filter((name) => !declared.has(name))
    expect(stale).toEqual([])
  })

  it('登记过的写方法广播，读方法原样透传', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeChanges(listener)
    const store = withChangeBus({
      saveFinance: async () => 1,
      trashedFinance: async () => [],
    } as unknown as DiaryStore)

    await store.saveFinance({} as never)
    expect(listener).toHaveBeenCalledTimes(1)

    await store.trashedFinance()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})
