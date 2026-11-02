/**
 * 更新链路的输入守卫。
 *
 * 渲染层能「下载一个 URL」和「拉起一个路径」，主进程一旦不认，
 * 就等于把这两步合成 remote code execution。这里盯着三件事：
 *   1. 只认我们自己仓库发出去的那个安装包地址；
 *   2. 落盘文件名必须是安装包形状，不能往「下载」目录写任意文件；
 *   3. 安装只允许「下载」目录里的那一个文件，`.part` 与子目录都算越界。
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const guards = require('../../../electron/updateGuards.cjs') as {
  isAllowedDownloadUrl: (url: string) => boolean
  isInstallerName: (name: string) => boolean
  resolveInstallerPath: (dir: string, rawPath: string) => string | null
}

const DOWNLOADS = resolve(process.env.TEMP ?? '/tmp', 'starburst-downloads')

describe('更新下载地址', () => {
  it('认我们 GitHub 仓库的 release 资产', () => {
    expect(
      guards.isAllowedDownloadUrl(
        'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.11.1/starburst-recorder-0.11.1-setup.exe',
      ),
    ).toBe(true)
  })

  it('测试版也在放行范围内', () => {
    expect(
      guards.isAllowedDownloadUrl(
        'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.12.0-beta.1/starburst-recorder-0.12.0-beta.1-setup.exe',
      ),
    ).toBe(true)
  })

  it('认 Gitee 的附件域名', () => {
    expect(guards.isAllowedDownloadUrl('https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.11.1/starburst-recorder-0.11.1-setup.exe')).toBe(true)
    expect(guards.isAllowedDownloadUrl('https://foruda.gitee.com/attachment/starburst-recorder-0.11.1-setup.exe')).toBe(true)
  })

  it('别人的仓库、别的文件名、别的站点都不认', () => {
    const cases = [
      // 明文协议
      'http://github.com/BrainLeech198/starburst_recorder/releases/download/v0.11.1/starburst-recorder-0.11.1-setup.exe',
      // 同域名下的别人仓库
      'https://github.com/evil/starburst_recorder/releases/download/v0.11.1/starburst-recorder-0.11.1-setup.exe',
      // 我们仓库但不是 release 下载路径
      'https://github.com/BrainLeech198/starburst_recorder/releases/tag/v0.11.1',
      // 我们仓库路径下但不是安装包
      'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.11.1/calc.exe',
      // 看着像我们域名，实际是别人的域
      'https://github.com.evil.com/BrainLeech198/starburst_recorder/releases/download/v0.11.1/starburst-recorder-0.11.1-setup.exe',
      'https://gitee.com.evil.com/starburst-recorder-0.11.1-setup.exe',
      // API 地址不带文件名，认不出安装包形状
      'https://api.github.com/repos/BrainLeech198/starburst_recorder/releases/assets/12345',
      '',
      'not a url',
    ]
    for (const url of cases) expect(guards.isAllowedDownloadUrl(url)).toBe(false)
  })
})

describe('安装包文件名', () => {
  it('认正式版与测试版，别的一概不认', () => {
    expect(guards.isInstallerName('starburst-recorder-0.11.1-setup.exe')).toBe(true)
    expect(guards.isInstallerName('starburst-recorder-0.12.0-beta.1-setup.exe')).toBe(true)
    for (const name of ['', 'calc.exe', 'starburst-recorder-0.11.1.apk', 'starburst-recorder-setup.exe', 'x:/a.exe', '..', '.']) {
      expect(guards.isInstallerName(name)).toBe(false)
    }
  })

  it('半截文件不当作安装包', () => {
    // 清理缓存要认它，但绝不能拿去过安装
    expect(guards.isInstallerName('starburst-recorder-0.11.1-setup.exe.part')).toBe(false)
    expect(guards.resolveInstallerPath(DOWNLOADS, join(DOWNLOADS, 'starburst-recorder-0.11.1-setup.exe.part'))).toBeNull()
  })
})

describe('拉起安装的路径', () => {
  const good = join(DOWNLOADS, 'starburst-recorder-0.11.1-setup.exe')

  it('只放行下载目录里那一层', () => {
    expect(guards.resolveInstallerPath(DOWNLOADS, good)).toBe(good)
    // 同一目录不同写法（结尾斜杠、大小写、`.` 段）仍算这个目录
    expect(guards.resolveInstallerPath(`${DOWNLOADS}/`, good)).toBe(good)
    expect(guards.resolveInstallerPath(DOWNLOADS, join(DOWNLOADS, '.', 'starburst-recorder-0.11.1-setup.exe'))).toBe(good)
  })

  it('跑目录、套子目录、指别处都不给装', () => {
    const cases = [
      join(DOWNLOADS, 'sub', 'starburst-recorder-0.11.1-setup.exe'),
      join(DOWNLOADS, '..', 'starburst-recorder-0.11.1-setup.exe'),
      join(process.env.TEMP ?? '/tmp', 'starburst-recorder-0.11.1-setup.exe'),
      'starburst-recorder-0.11.1-setup.exe',
      'C:\\Windows\\System32\\calc.exe',
      '',
    ]
    for (const target of cases) expect(guards.resolveInstallerPath(DOWNLOADS, target)).toBeNull()
  })

  it('下载 URL 里用百分号编码换个名字也混不进来', () => {
    const url =
      'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.11.1/%2A%2Fcalc.exe'
    expect(guards.isAllowedDownloadUrl(url)).toBe(false)
  })
})
