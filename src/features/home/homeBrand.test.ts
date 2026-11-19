import { afterEach, describe, expect, it } from 'vitest'
import { dismissHomeBrand, isHomeBrandDismissed } from './homeBrand'

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  return values
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('home brand dismissal', () => {
  it('starts visible and stays dismissed after the user taps the mark', () => {
    const storage = installStorage()
    expect(isHomeBrandDismissed()).toBe(false)
    dismissHomeBrand()
    expect(storage.get('sb_home_brand_hidden')).toBe('1')
    expect(isHomeBrandDismissed()).toBe(true)
  })

  it('does not hide the brand for another preference value', () => {
    installStorage({ sb_home_brand_hidden: '0' })
    expect(isHomeBrandDismissed()).toBe(false)
  })
})
