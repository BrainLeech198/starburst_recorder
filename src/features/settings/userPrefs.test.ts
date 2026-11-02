import { afterEach, describe, expect, it } from 'vitest'
import {
  PREF_KEYS,
  applyPrefs,
  exportPrefs,
  prefsContainSecrets,
  prefsCount,
  readPrefs,
} from './userPrefs'

/** 最小可用的 Storage 替身：Node 环境没有 localStorage，行为够测就够了 */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    /** 测试里直接看结果用 */
    dump: () => Object.fromEntries(map),
  } as Storage & { dump: () => Record<string, string> }
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function install(store: Storage | undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('exportPrefs', () => {
  it('只带走白名单里的键，别的键不碰', () => {
    install(
      fakeStorage({
        'starburst.theme': 'paper',
        'sb_locale': 'ja',
        'starburst.debug.ball': '0',
        'sb_assistant_sessions_v1': '[]',
      }) as Storage,
    )
    expect(exportPrefs()).toEqual({ 'starburst.theme': 'paper', sb_locale: 'ja' })
  })

  it('没有 localStorage（隐私模式 / 服务端）时给空快照，不抛错', () => {
    install(undefined)
    expect(exportPrefs()).toEqual({})
  })
})

describe('readPrefs', () => {
  it('不在白名单里的键一律丢弃', () => {
    expect(readPrefs({ 'starburst.theme': 'dark', 'evil.key': 'x' })).toEqual({
      'starburst.theme': 'dark',
    })
  })

  it('非字符串、数组、null 都不认', () => {
    expect(readPrefs({ 'starburst.theme': 1, 'sb_locale': null, 'starburst.care': [] })).toEqual({})
    expect(readPrefs(null)).toEqual({})
    expect(readPrefs('[]')).toEqual({})
    expect(readPrefs([{ 'starburst.theme': 'dark' }])).toEqual({})
  })

  it('超长值丢掉，其余照收', () => {
    const huge = 'x'.repeat(1_000_001)
    expect(readPrefs({ 'starburst.theme': 'dark', 'sb_weather_place': huge })).toEqual({
      'starburst.theme': 'dark',
    })
  })

  it('白名单本身就是导出范围，别在别处另列一份', () => {
    expect(PREF_KEYS).toContain('sb_assistant_memories')
    expect(PREF_KEYS).toContain('sb_ai_models')
    expect(new Set(PREF_KEYS).size).toBe(PREF_KEYS.length)
  })
})

describe('applyPrefs', () => {
  it('merge 只覆盖文件里有的键，本机其余的留着', () => {
    const store = fakeStorage({ 'starburst.theme': 'dark', 'sb_locale': 'en' })
    install(store)
    expect(applyPrefs({ 'starburst.theme': 'paper' }, 'merge')).toBe(1)
    expect(store.dump()).toEqual({ 'starburst.theme': 'paper', sb_locale: 'en' })
  })

  it('replace 先把白名单键清空，等于恢复成备份时的样子', () => {
    const store = fakeStorage({ 'starburst.theme': 'dark', 'sb_locale': 'en' })
    install(store)
    expect(applyPrefs({ 'sb_locale': 'ja' }, 'replace')).toBe(1)
    expect(store.dump()).toEqual({ sb_locale: 'ja' })
  })

  it('replace 不会碰白名单以外的键', () => {
    const store = fakeStorage({ 'starburst.debug.ball': '0', 'starburst.theme': 'dark' })
    install(store)
    applyPrefs({}, 'replace')
    expect(store.dump()).toEqual({ 'starburst.debug.ball': '0' })
  })

  it('脏值进不来：白名单外的键写不进本机', () => {
    const store = fakeStorage()
    install(store)
    expect(applyPrefs({ 'evil.key': 'x' }, 'merge')).toBe(0)
    expect(store.dump()).toEqual({})
  })

  it('没有 localStorage 时返回 0，不抛错', () => {
    install(undefined)
    expect(applyPrefs({ 'starburst.theme': 'dark' }, 'merge')).toBe(0)
  })
})

describe('prefsCount', () => {
  it('数有几项，空快照是 0', () => {
    expect(prefsCount(undefined)).toBe(0)
    expect(prefsCount({})).toBe(0)
    expect(prefsCount({ a: '1', b: '2' })).toBe(2)
  })
})

describe('prefsContainSecrets', () => {
  const models = (apiKey: string) =>
    JSON.stringify([{ id: 'm1', baseUrl: 'https://x', model: 'y', apiKey }])

  it('有非空 apiKey 才算带密钥', () => {
    expect(prefsContainSecrets({ sb_ai_models: models('sk-1') })).toBe(true)
    expect(prefsContainSecrets({ sb_ai_models: models('   ') })).toBe(false)
  })

  it('没有模型配置、或配置坏了，都不提示', () => {
    expect(prefsContainSecrets(undefined)).toBe(false)
    expect(prefsContainSecrets({})).toBe(false)
    expect(prefsContainSecrets({ sb_ai_models: 'not json' })).toBe(false)
    expect(prefsContainSecrets({ sb_ai_models: '{"a":1}' })).toBe(false)
  })
})
