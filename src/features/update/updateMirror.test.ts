import { describe, expect, test } from 'vitest'
import { downloadUrlsFor } from './updateService'

const GITHUB_ASSET =
  'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8.apk'
const GITEE_ASSET =
  'https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8.apk'

describe('downloadUrlsFor', () => {
  test('安卓先走 Gitee，再用 GitHub 兜底', () => {
    expect(
      downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8.apk', true, GITHUB_ASSET),
    ).toEqual([GITEE_ASSET, GITHUB_ASSET])
  })

  test('桌面先走 Release 里挑出的资产，再用 Gitee 兜底', () => {
    expect(
      downloadUrlsFor(
        '0.2.8',
        'starburst-recorder-0.2.8-setup.exe',
        false,
        'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8-setup.exe',
      ),
    ).toEqual([
      'https://github.com/BrainLeech198/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8-setup.exe',
      'https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8-setup.exe',
    ])
  })

  test('资产地址与拼出来的一样时只留一份', () => {
    expect(
      downloadUrlsFor('0.2.8', 'starburst-recorder-0.2.8.apk', false, GITHUB_ASSET),
    ).toEqual([
      GITHUB_ASSET,
      'https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v0.2.8/starburst-recorder-0.2.8.apk',
    ])
  })
})
