import { afterEach, describe, expect, test, vi } from 'vitest'
import { downloadUrlsFor, orderUrlsBySource } from './updateService'

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
