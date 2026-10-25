/**
 * 检查更新。
 *
 * 两个源：GitHub 优先，失败退 Gitee（国内网络更稳）。桌面端由主进程代取（没有 CORS，
 * 也走系统代理）；浏览器和安卓走 fetch，拿不到就安静地放弃，不打扰用户。
 *
 * 版本号比较只看三段数字：'v0.2.0' 与 '0.2.0-beta' 都算 0.2.0，
 * 预发布版不提示——用户装的是哪个版本，就只跟正式发版比。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { APP_VERSION } from '@/core/version'
import { isNewerVersion } from '@/core/utils/versionCompare'
import { desktopBridge } from '@/platform/desktop'

export interface UpdateInfo {
  version: string
  notes: string
  /** 发版页，给「手动看看」用 */
  pageUrl: string
  /** 安装包直链 */
  downloadUrl: string
  fileName: string
}

const GITHUB_REPO = 'BrainLeech198/starburst_recorder'
const GITEE_REPO = 'Mr_brainleech/starburst_recorder'
const SNOOZE_KEY = 'sb.update.snoozed'

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

/** 只看正式版：latest 比 current 新就返回 true */
export function isNewer(latest: string, current = APP_VERSION): boolean {
  return isNewerVersion(latest, current)
}

/** 今天是不是已经把这个版本「稍后」掉了；一天只烦一次 */
function snoozedToday(version: string): boolean {
  try {
    return localStorage.getItem(SNOOZE_KEY) === `${version}@${new Date().toDateString()}`
  } catch {
    return false
  }
}

export function snooze(version: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, `${version}@${new Date().toDateString()}`)
  } catch {
    // 存不了就只在本次会话生效
  }
}

export function shouldPrompt(info: UpdateInfo): boolean {
  return !snoozedToday(info.version)
}

interface RawRelease {
  tag_name?: string
  body?: string
  html_url?: string
  assets?: { name?: string; browser_download_url?: string }[]
}

/** 从一份 Release JSON 里挑出当前平台要下的那个文件 */
function pickAsset(assets: RawRelease['assets'], android: boolean): { url: string; name: string } | null {
  const list = assets ?? []
  const wanted = android
    ? list.find((item) => (item.name ?? '').toLowerCase().endsWith('.apk'))
    : list.find((item) => (item.name ?? '').toLowerCase().endsWith('.exe'))
  if (!wanted?.browser_download_url) return null
  return { url: wanted.browser_download_url, name: wanted.name ?? (android ? 'update.apk' : 'update.exe') }
}

function normalize(raw: RawRelease | null, pageUrl: string, android: boolean): UpdateInfo | null {
  if (!raw?.tag_name) return null
  const version = raw.tag_name.replace(/^v/i, '')
  if (!isNewer(version)) return null
  const asset = pickAsset(raw.assets, android)
  if (!asset) return null
  return {
    version,
    notes: (raw.body ?? '').trim(),
    pageUrl: raw.html_url || pageUrl,
    downloadUrl: asset.url,
    fileName: android ? `starburst-recorder-${version}.apk` : `starburst-recorder-${version}-setup.exe`,
  }
}

async function fetchJson(url: string): Promise<RawRelease | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    return (await response.json()) as RawRelease
  } catch {
    return null
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null
    const text = (await response.text()).trim()
    return text === '' ? null : text
  } catch {
    return null
  }
}

/**
 * 中文界面的更新说明。
 *
 * 官网那条静态文件最可靠（不带 CORS、不限流），Gitee 反过来会被限流到
 * 直接回 HTML 报错页；两边都拿不到就退回 GitHub 的英文说明。
 */
async function fetchChineseNotes(version: string): Promise<string | null> {
  const fromSite = await fetchText(
    'https://brainleech198.github.io/starburst_recorder/notes.zh.md',
  )
  if (fromSite) return fromSite

  const gitee = await fetchJson(`https://gitee.com/api/v5/repos/${GITEE_REPO}/releases/latest`)
  const body = String(gitee?.body ?? '').trim()
  const tag = String(gitee?.tag_name ?? '').replace(/^v/i, '')
  return body && tag === version ? body : null
}

/**
 * 检查一次；没有新版、两个源都失败、或当前平台没有对应安装包时返回 null。
 *
 * 版本号和下载地址一律取 GitHub（两个平台的包都传在那儿）；
 * 中文界面会再取一次 Gitee，把同版本的更新说明换成中文那版。
 */
export async function checkForUpdate(locale: 'zh' | 'en' = 'zh'): Promise<UpdateInfo | null> {
  const android = isAndroid()

  // 桌面端交给主进程：不受 CORS 限制，也跟系统代理走
  const desktop = desktopBridge()
  if (desktop?.update) {
    const info = await desktop.update.check(locale)
    return info && isNewer(info.version) ? info : null
  }

  const github = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
  let info = normalize(github, `https://github.com/${GITHUB_REPO}/releases`, android)

  // GitHub 连不上（国内网络常见）时退到 Gitee；Gitee 上安卓包一定在，桌面包可能因为
  // 100 MB 上限缺席——那种情况 normalize 会返回 null，安静地当作「没有更新」。
  if (!info) {
    const gitee = await fetchJson(`https://gitee.com/api/v5/repos/${GITEE_REPO}/releases/latest`)
    info = normalize(gitee, `https://gitee.com/${GITEE_REPO}/releases`, android)
    if (!info) return null
  }

  // 中文界面换成中文说明
  if (locale === 'zh') {
    const notes = await fetchChineseNotes(info.version)
    if (notes) info.notes = notes
  }

  return info
}

export interface DownloadResult {
  ok: boolean
  /** 桌面端落到磁盘的位置 */
  path?: string | null
  error?: string
}

/** 下载进度：received 已写盘字节数，total 为 0 表示服务端没给长度 */
export interface DownloadProgress {
  received: number
  total: number
}

/**
 * 订阅下载进度。桌面走主进程推送，安卓走原生插件事件，
 * 浏览器里没有可靠进度（直接交给浏览器的下载管理），返回一个空订阅。
 */
export function onDownloadProgress(listener: (progress: DownloadProgress) => void): () => void {
  const desktop = desktopBridge()
  if (desktop?.update) return desktop.update.onProgress(listener)

  const native = androidNative()
  if (native) {
    let removed = false
    let unsubscribe: (() => Promise<void>) | null = null
    void native.addListener('progress', listener).then((handle) => {
      if (removed) void handle.remove()
      else unsubscribe = handle.remove
    })
    return () => {
      removed = true
      void unsubscribe?.()
    }
  }

  return () => {}
}

/** 下载安装包：桌面端下到「下载」并在下载完后打开安装程序 */
export async function downloadUpdate(info: UpdateInfo): Promise<DownloadResult> {
  const desktop = desktopBridge()
  if (desktop?.update) {
    const result = await desktop.update.download(info.downloadUrl, info.fileName)
    if (result.ok && result.path) await desktop.update.open(result.path)
    return result
  }

  const native = androidNative()
  if (native) {
    // 安卓壳里下完会自己拉起系统安装器，这里只等「开始下载」的确认
    await native.downloadAndInstall({ url: info.downloadUrl, fileName: info.fileName })
    return { ok: true }
  }

  // 浏览器调试：交给浏览器的下载管理
  window.open(info.downloadUrl, '_blank', 'noopener')
  return { ok: true }
}

/** 安卓原生插件（见 android/.../UpdatePlugin.java）：下 APK 并拉起系统安装器 */
interface NativeUpdatePlugin {
  downloadAndInstall: (options: { url: string; fileName: string }) => Promise<{ ok?: boolean }>
  addListener: (
    event: 'progress',
    listener: (payload: { received: number; total: number }) => void,
  ) => Promise<{ remove: () => Promise<void> }>
}

const NativeUpdate = registerPlugin<NativeUpdatePlugin>('Update')

function androidNative(): NativeUpdatePlugin | undefined {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    ? NativeUpdate
    : undefined
}
