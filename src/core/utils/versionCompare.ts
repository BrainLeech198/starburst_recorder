/**
 * 版本号比较：主版本 + 预发布后缀。
 *
 * 正式版和测试版现在共用一套版本号，所以不能再把后缀一剥了事：
 *   0.8.0-beta.2 < 0.8.0-beta.10 < 0.8.0 < 0.8.1-beta.1
 *
 * 规则照 SemVer 的预发布部分：数字段与数字段比大小，数字段小于文字段，
 * 其余按字典序；都相同时段数少的小。
 */
export interface ParsedVersion {
  /** 主版本三段数字，缺的补 0 */
  parts: number[]
  /** 预发布标识；正式版是空数组 */
  prerelease: (number | string)[]
}

/** 'v0.2.1-beta.3+build.7' → parts [0,2,1], prerelease ['beta',3] */
export function parseVersion(version: string): ParsedVersion {
  const cleaned = version.trim().replace(/^v/i, '').split('+')[0]
  const dash = cleaned.indexOf('-')
  const base = dash === -1 ? cleaned : cleaned.slice(0, dash)
  const suffix = dash === -1 ? '' : cleaned.slice(dash + 1)
  const parts = base
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 3)
  while (parts.length < 3) parts.push(0)
  const prerelease = suffix === ''
    ? []
    : suffix.split('.').map((part) => {
        const numeric = /^\d+$/.test(part) ? Number(part) : null
        return numeric === null ? part : numeric
      })
  return { parts, prerelease }
}

/** 兼容旧调用方：只要三段数字 */
export function versionParts(version: string): number[] {
  return parseVersion(version).parts
}

export function isPrereleaseVersion(version: string): boolean {
  return parseVersion(version).prerelease.length > 0
}

function compareNumber(left: number, right: number) {
  return left === right ? 0 : left > right ? 1 : -1
}

function comparePrerelease(left: (number | string)[], right: (number | string)[]) {
  // 正式版比同号的预发布版高
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === b) continue
    if (typeof a === 'number' && typeof b === 'number') return compareNumber(a, b)
    // 数字段优先级低于文字段
    if (typeof a === 'number') return -1
    if (typeof b === 'number') return 1
    return a < b ? -1 : 1
  }
  return compareNumber(left.length, right.length)
}

/** 返回 >0 表示 a 更新，<0 表示 a 更旧，0 相同 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let index = 0; index < 3; index += 1) {
    const diff = compareNumber(left.parts[index] ?? 0, right.parts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
