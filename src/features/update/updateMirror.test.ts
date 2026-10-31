import { afterEach, describe, expect, test, vi } from 'vitest'
import { checkForUpdate, downloadUrlsFor, orderUrlsBySource } from './updateService'

const GITHUB_ASSET =
  'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8.apk'
const GITEE_ASSET =
  'https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8.apk'
const GITHUB_EXE =
  'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8-setup.exe'
const GITEE_EXE =
  'https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8-setup.exe'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 假 fetch：按调用顺序返回预先排好的 JSON */
function stubFetch(payloads: unknown[]) {
  const fetchMock = vi.fn(async (url: string) => {
    void url
    const next = payloads.shift()
    return { ok: next !== undefined, json: async () => next }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', {})
  return fetchMock
}

/** 一条 Windows Release；测试环境里 APP_VERSION 是 0.0.0 */
function release(version: string, extra: Record<string, unknown> = {}) {
  const fileName = `starburst-recorder-${version}-setup.exe`
  return {
    tag_name: `v${version}`,
    body: `${version} notes`,
    html_url: `https://github.com/BrainLeech198/starburst_recorder/releases/tag/v${version}`,
    assets: [
      {
        name: fileName,
        browser_download_url: `https://github.com/BrainLeech198/starburst_recorder/releases/download/v${version}/${fileName}`,
      },
    ],
    ...extra,
  }
}

describe('downloadUrlsFor', () => {
  test('没设置过时默认 Gitee 先走（安卓）', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8.apk', true, GITHUB_ASSET)).toEqual([
      GITEE_ASSET,
      GITHUB_ASSET,
    ])
  })

  test('选 Gitee 时桌面也先走 Gitee，GitHub 兜底', () => {
    expect(
      downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8-setup.exe', false, GITHUB_EXE, 'gitee'),
    ).toEqual([GITEE_EXE, GITHUB_EXE])
  })

  test('选 GitHub 时 GitHub 先走，Gitee 兜底', () => {
    expect(
      downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8.apk', true, GITHUB_ASSET, 'github'),
    ).toEqual([GITHUB_ASSET, GITEE_ASSET])
  })

  test('资产地址与拼出来的一样时只留一份', () => {
    expect(
      downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8.apk', false, GITHUB_ASSET, 'github'),
    ).toEqual([GITHUB_ASSET, GITEE_ASSET])
  })

  test('测试版只走 GitHub，不拼 Gitee 地址', () => {
    const betaAsset =
      'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.9-beta.1/starburst-recorder-0.2.9-beta.1.apk'
    expect(
      downloadUrlsFor(
        '0.2.9-beta.1',
        'starburst-recorder-0.2.9-beta.1.apk',
        true,
        betaAsset,
        'gitee',
      ),
    ).toEqual([betaAsset])
  })
})

describe('orderUrlsBySource', () => {
  test('选中的源排前面，同源内部保持原顺序', () => {
    expect(orderUrlsBySource([GITHUB_EXE, GITEE_EXE, GITHUB_ASSET], 'gitee')).toEqual([
      GITEE_EXE,
      GITHUB_EXE,
      GITHUB_ASSET,
    ])
    expect(orderUrlsBySource([GITHUB_EXE, GITEE_EXE, GITHUB_ASSET], 'github')).toEqual([
      GITHUB_EXE,
      GITHUB_ASSET,
      GITEE_EXE,
    ])
  })
})

describe('checkForUpdate 通道', () => {
  test('正式版只认 latest，预发布不会冒出来', async () => {
    const fetchMock = stubFetch([release('0.3.0-beta.2'), null])
    expect(await checkForUpdate('en', 'stable')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('正式版拿到新版时直接返回，不再问 Gitee', async () => {
    const fetchMock = stubFetch([release('0.3.0')])
    const info = await checkForUpdate('en', 'stable')
    expect(info?.version).toBe('0.3.0')
    expect(info?.beta).toBe(false)
    expect(info?.notes).toBe('0.3.0 notes')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('测试版从列表里跳过草稿，按语义化版本取最高', async () => {
    const fetchMock = stubFetch([
      [
        release('0.3.0-beta.2'),
        release('0.3.0-beta.10', { draft: true }),
        release('0.2.9'),
        release('0.3.0-beta.1'),
      ],
    ])
    const info = await checkForUpdate('en', 'beta')
    expect(info?.version).toBe('0.3.0-beta.2')
    expect(info?.beta).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toContain('/releases?per_page=20')
  })

  test('测试版用户能看到更高的正式版', async () => {
    stubFetch([[release('0.4.0'), release('0.3.0-beta.3')]])
    const info = await checkForUpdate('en', 'beta')
    expect(info?.version).toBe('0.4.0')
    expect(info?.beta).toBe(false)
  })
})
