/**
 * 版本号比较：只认三段数字。
 * 'v0.2.0'、'0.2.0-beta.2'、'0.2' 分别算 [0,2,0]、[0,2,0]、[0,2,0]。
 * 预发布版靠 tag 的 prerelease 标记排除，这里不再区分。
 */
export function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 3)
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest)
  const b = versionParts(current)
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return false
}
