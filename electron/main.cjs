// Electron 主进程：把打包好的网页装进一个真正的 Windows 窗口里。
//
// 这里刻意不用 file:// 直接打开 index.html，而是注册一个 app:// 协议：
// file:// 的 origin 是 opaque 的，ES module、fetch、IndexedDB 都可能被 CORS 或
// 存储策略拦住；给它一个标准的 origin（app://starburst）这些就都按常规工作。
const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  shell,
  Tray,
  Menu,
  screen,
  session,
} = require('electron')
const path = require('node:path')
const nodeUrl = require('node:url')
const fs = require('node:fs')
const os = require('node:os')
const { Readable } = require('node:stream')
const { createDatabase } = require('./database.cjs')

/** 窗口不能小于这个尺寸，免得版式被压坏 */
const MIN_WIDTH = 420
const MIN_HEIGHT = 560

/**
 * 主窗口的位置、大小、是否最大化。
 *
 * 设置页里的「窗口尺寸」和直接拖边框都会改它，但以前只改了当前窗口，
 * 一重启就回到默认的 1000×760。这里把它落到 userData 下的一个小文件里，
 * 和数据库同一个目录，删掉这个文件就等于恢复默认。
 */
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

/** 坐标还落在某块屏幕的可见范围里吗（换显示器后旧坐标可能完全在屏幕外） */
function isOnScreen(x, y, width, height) {
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      x + width > workArea.x + 80 &&
      x < workArea.x + workArea.width - 80 &&
      y + height > workArea.y + 40 &&
      y < workArea.y + workArea.height - 40
    )
  })
}

/** 读上次的窗口状态；文件坏了、数字不对、位置在屏幕外，都当没存过 */
function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'))
    if (!saved || typeof saved !== 'object') return null
    const width = Math.round(Number(saved.width))
    const height = Math.round(Number(saved.height))
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    const state = {
      width: Math.max(MIN_WIDTH, width),
      height: Math.max(MIN_HEIGHT, height),
      maximized: saved.maximized === true,
    }
    const x = Math.round(Number(saved.x))
    const y = Math.round(Number(saved.y))
    if (Number.isFinite(x) && Number.isFinite(y) && isOnScreen(x, y, state.width, state.height)) {
      state.x = x
      state.y = y
    }
    return state
  } catch {
    return null
  }
}

/**
 * 存窗口状态。最大化时 getBounds() 给的是铺满屏幕的尺寸，
 * 用 getNormalBounds() 才能记住还原后的大小。
 */
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
      'utf8',
    )
  } catch (error) {
    console.error('[window-state] 保存失败', error)
  }
}

const DIST = path.join(__dirname, '..', '.local', 'dist')
const APP_URL = 'app://starburst/index.html'

/** 托盘常驻：真正退出前一直是 true，用来放行窗口的 close 事件 */
let isQuitting = false
/** 托盘和主窗口都放模块级，单实例回切和菜单都要用 */
let tray = null
let mainWindow = null
/** 快速记一笔的小窗，记录完就销毁，不常驻 */
let quickWindow = null
/** 首次收进托盘时提示一次，之后不再打扰 */
let trayHintShown = false

// 只允许开一个实例：托盘常驻之后，第二个实例会把窗口和托盘搞重，用户也分不清点的是哪个
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

/** 把 app://starburst/xxx 映射到 dist/xxx，并挡掉目录穿越 */
function assetPathFor(requestUrl) {
  const { pathname } = new URL(requestUrl)
  const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  const target = path.join(DIST, relative)
  if (!target.startsWith(DIST)) return null
  return target
}

function createWindow() {
  const state = readWindowState()
  // 默认 1000×760 在 768 高的屏幕上会被任务栏挤出去，开窗前先按可用区域收一收
  const area = screen.getPrimaryDisplay().workArea
  const maxWidth = Math.max(MIN_WIDTH, area.width - 40)
  const maxHeight = Math.max(MIN_HEIGHT, area.height - 40)
  const win = new BrowserWindow({
    width: Math.min(state?.width ?? 1000, maxWidth),
    height: Math.min(state?.height ?? 760, maxHeight),
    ...(state?.x !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: '星芒记录者',
    // 和深空主题的底色一致，避免窗口出现时先闪一下白
    backgroundColor: '#0b1017',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win

  // 拖边框、点设置页的预设、最大化都会落盘；防抖一下，别拖一次写几十次文件
  let saveTimer = null
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)

  if (state?.maximized) win.maximize()

  // 点关闭不退出，收进托盘；只有真的走「退出应用」时才放行
  win.on('close', (event) => {
    saveWindowState(win)
    if (isQuitting) return
    event.preventDefault()
    win.hide()
    // 托盘图标可能被 Windows 折进「^」里，第一次收起时说一句，免得以为程序已经关了
    if (!trayHintShown && tray && process.platform === 'win32') {
      trayHintShown = true
      tray.displayBalloon({
        title: '星芒记录者还在后台',
        content: '窗口已收进托盘，点托盘图标可以叫回来；右键托盘可以退出。',
      })
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // 渲染进程的报错直接打到终端，方便排查
  win.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[load-failed] ${code} ${description} ${url}`)
  })

  win.loadURL(APP_URL)
  return win
}

/**
 * 托盘图标：开发时和打包后都从 app 根目录找同一份 ico，
 * 打包配置里已经把 package/windows/icon.ico 带进去了。
 */
function trayIconPath() {
  return path.join(app.getAppPath(), 'package', 'windows', 'icon.ico')
}

/** 点托盘图标把窗口叫回来；右键是菜单 */
function showWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * 快速记一笔：不打开主窗口的独立小窗。
 * 记完由页面自己调 quick:close 关掉，这里只负责开。
 */
function showQuickCapture() {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.show()
    quickWindow.focus()
    return
  }

  quickWindow = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    frame: false,
    title: '快速记一笔',
    backgroundColor: '#0b1017',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  quickWindow.on('closed', () => {
    quickWindow = null
  })
  // 失去焦点不自动关：正在打字时切窗口不该把内容丢掉
  quickWindow.loadURL(`${APP_URL}#/quick`)
  quickWindow.once('ready-to-show', () => quickWindow.show())
}

/** 页面上按 Esc 或点保存之后，把窗口关掉 */
ipcMain.handle('quick:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && win === quickWindow) win.close()
})

/**
 * 一个窗口写了数据，通知其他窗口重新查询。
 * 快速记一笔在独立窗口里写库，主窗口的订阅总线看不到，需要这一条转发。
 */
ipcMain.on('db:notify', (event) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents !== event.sender) win.webContents.send('db:changed')
  }
})

/** 全局快捷键留给别的软件：本应用不注册任何系统级热键，入口只有托盘菜单 */

function createTray() {
  if (tray) return
  tray = new Tray(trayIconPath())
  tray.setToolTip('星芒记录者')
  tray.on('click', showWindow)

  // 以后要加的东西（开机自启、今日进度、AI 整理今天）都往这个数组里塞，
  // 菜单结构不用再动
  const items = [
    { label: '显示窗口', click: showWindow },
    { label: '快速记一笔', click: showQuickCapture },
    { type: 'separator' },
    { label: '退出应用', click: () => app.quit() },
  ]

  tray.setContextMenu(Menu.buildFromTemplate(items))
}

// 设置页里的「窗口尺寸」通过这两个通道生效
/** 当前窗口所在屏幕的可用区域；预设尺寸比屏幕还大时按它收一收 */
function workAreaFor(win) {
  const display = screen.getDisplayMatching(win.getBounds())
  return display.workArea
}

ipcMain.handle('window:set-size', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const area = workAreaFor(win)
  // 上下左右各留一点，别贴着任务栏和屏幕边缘
  const maxWidth = Math.max(MIN_WIDTH, area.width - 40)
  const maxHeight = Math.max(MIN_HEIGHT, area.height - 40)
  const nextWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, Math.round(Number(width) || 0)))
  const nextHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, Math.round(Number(height) || 0)))
  win.setSize(nextWidth, nextHeight)
  win.center()
  return true
})

ipcMain.handle('window:get-size', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const [width, height] = win.getSize()
  return { width, height }
})

/**
 * AI 请求从主进程发出去。
 *
 * 为什么不让网页自己发：网页直连第三方 API 会被跨域策略拦掉（厂商配不配 CORS 头是碰运气的），
 * 而且 key 会出现在渲染进程的网络栈里。主进程这边这两个问题都不存在。
 * 这里用 net.fetch 而不是全局 fetch——它会跟着系统代理设置走，国内直连 OpenAI 时很关键。
 */
function chatUrl(baseUrl) {
  return `${String(baseUrl).trim().replace(/\/+$/, '')}/chat/completions`
}

/** 服务商认的两种密钥头都带上；本机模型不校验 key，给个占位免得服务端报空 */
function aiHeaders(apiKey) {
  const key = String(apiKey ?? '').trim() || 'ollama'
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    // 小米 MiMo 的文档里用的是 api-key 头，两个都带上，省得对不上
    'api-key': key,
  }
}

/** GET {baseUrl}/models：设置页的模型下拉靠它，失败就当没有，不影响手填 */
ipcMain.handle('ai:models', async (_event, request) => {
  const started = Date.now()
  const baseUrl = String(request?.baseUrl ?? '').trim()
  if (!baseUrl) {
    return { ok: false, status: 0, body: '', ms: 0, error: '服务地址还没填' }
  }

  try {
    const response = await net.fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: aiHeaders(request?.apiKey),
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      ms: Date.now() - started,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      ms: Date.now() - started,
      error: String(error?.message ?? error),
    }
  }
})

ipcMain.handle('ai:chat', async (_event, request) => {
  const started = Date.now()
  const baseUrl = String(request?.baseUrl ?? '').trim()
  const model = String(request?.model ?? '').trim()
  const apiKey = String(request?.apiKey ?? '').trim() || 'ollama'

  if (!baseUrl || !model) {
    return { ok: false, status: 0, body: '', ms: 0, error: '服务地址和模型名还没填全' }
  }

  try {
    const requestBody = { model, messages: request?.messages ?? [], stream: false }
    // 采样参数有就透传：换 seed 是「每次写法不一样」的关键，别在主进程这里被吞掉
    if (request?.temperature !== undefined) requestBody.temperature = request.temperature
    if (request?.seed !== undefined) requestBody.seed = request.seed

    const response = await net.fetch(chatUrl(baseUrl), {
      method: 'POST',
      headers: aiHeaders(apiKey),
      body: JSON.stringify(requestBody),
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      ms: Date.now() - started,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      ms: Date.now() - started,
      error: String(error?.message ?? error),
    }
  }
})

/**
 * 本地数据库：桌面版的数据落在 userData 下的 starburst.db（SQLite）。
 * 懒打开——第一次有请求时才建文件，窗口本身不依赖数据库能不能开。
 */
let database = null
function getDatabase() {
  if (!database) {
    database = createDatabase(path.join(app.getPath('userData'), 'starburst.db'))
  }
  return database
}

// 渲染进程只有这一个入口，方法名由 database.cjs 的白名单兜底
ipcMain.handle('db:call', (_event, method, args) => getDatabase().call(method, args))
ipcMain.handle('db:path', () => getDatabase().file)

/**
 * 检查更新：主进程代取 Release JSON（没有 CORS，也跟系统代理走）。
 * GitHub 先试，失败退 Gitee；版本号只比三段数字，预发布版不提示。
 */
function versionParts(version) {
  return String(version)
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 3)
}

function isNewerVersion(latest, current) {
  const a = versionParts(latest)
  const b = versionParts(current)
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return false
}

function pickUpdateAsset(assets, wantApk) {
  const list = Array.isArray(assets) ? assets : []
  const hit = list.find((item) =>
    String(item?.name ?? '')
      .toLowerCase()
      .endsWith(wantApk ? '.apk' : '.exe'),
  )
  return hit?.browser_download_url ? { url: hit.browser_download_url, name: hit.name } : null
}

function normalizeRelease(raw, pageUrl, wantApk) {
  if (!raw?.tag_name) return null
  const version = String(raw.tag_name).replace(/^v/i, '')
  if (!isNewerVersion(version, app.getVersion())) return null
  const asset = pickUpdateAsset(raw.assets, wantApk)
  if (!asset) return null
  const fileName = wantApk
    ? `starburst-recorder-${version}.apk`
    : `starburst-recorder-${version}-setup.exe`
  // 另一个源：这个资产来自 GitHub 就补 Gitee，反之补 GitHub
  const fallbackUrl = asset.url.includes('gitee.com')
    ? `https://github.com/BrainLeech198/starburst_recorder/releases/download/v${version}/${fileName}`
    : `https://gitee.com/Mr_brainleech/starburst_recorder/releases/download/v${version}/${fileName}`
  return {
    version,
    notes: String(raw.body ?? '').trim(),
    pageUrl: raw.html_url || pageUrl,
    downloadUrl: asset.url,
    fallbackUrl,
    fileName,
  }
}

async function fetchReleaseJson(url) {
  try {
    const response = await net.fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function fetchReleaseText(url) {
  try {
    const response = await net.fetch(url)
    if (!response.ok) return null
    const text = (await response.text()).trim()
    return text === '' ? null : text
  } catch {
    return null
  }
}

/** 中文说明：官网静态文件最稳（不限流），Gitee 反过来会被限流到回 HTML 报错页 */
async function fetchChineseNotes(version) {
  const fromSite = await fetchReleaseText(
    'https://brainleech198.github.io/starburst_recorder/notes.zh.md',
  )
  if (fromSite) return fromSite

  const gitee = await fetchReleaseJson(UPDATE_SOURCES.gitee)
  const body = String(gitee?.body ?? '').trim()
  const tag = String(gitee?.tag_name ?? '').replace(/^v/i, '')
  return body && tag === version ? body : null
}

const UPDATE_SOURCES = {
  github: 'https://api.github.com/repos/BrainLeech198/starburst_recorder/releases/latest',
  gitee: 'https://gitee.com/api/v5/repos/Mr_brainleech/starburst_recorder/releases/latest',
}

ipcMain.handle('update:check', async (_event, locale) => {
  const wantApk = process.platform !== 'win32' && process.platform !== 'darwin'
  const github = await fetchReleaseJson(UPDATE_SOURCES.github)
  let info = normalizeRelease(
    github,
    'https://github.com/BrainLeech198/starburst_recorder/releases',
    wantApk,
  )

  // GitHub 拿不到就退 Gitee；Gitee 上可能只有 APK，那 normalize 会返回 null
  if (!info) {
    const gitee = await fetchReleaseJson(UPDATE_SOURCES.gitee)
    info = normalizeRelease(
      gitee,
      'https://gitee.com/Mr_brainleech/starburst_recorder/releases',
      wantApk,
    )
    if (!info) return null
  }

  // 中文界面换成中文说明
  if (locale === 'zh') {
    const notes = await fetchChineseNotes(info.version)
    if (notes) info.notes = notes
  }

  return info
})

/** 下载安装包到「下载」目录；边下边写盘，进度用 update:progress 推给页面 */
ipcMain.handle('update:download', async (event, url, fileName) => {
  try {
    const response = await net.fetch(String(url), { redirect: 'follow' })
    if (!response.ok || !response.body) return { ok: false, error: `HTTP ${response.status}` }
    const total = Number(response.headers.get('content-length') ?? 0) || 0
    const dir = app.getPath('downloads')
    const safe = String(fileName || 'starburst-update.bin').replace(/[/:*?"<>|\\]/g, '_')
    const target = path.join(dir, safe)
    await fs.promises.mkdir(dir, { recursive: true })

    let received = 0
    let lastPush = 0
    await new Promise((resolve, reject) => {
      const stream = Readable.fromWeb(response.body)
      const file = fs.createWriteStream(target)
      stream.on('data', (chunk) => {
        received += chunk.length
        const now = Date.now()
        if (now - lastPush >= 1000 || (total > 0 && received >= total)) {
          lastPush = now
          event.sender.send('update:progress', { received, total })
        }
      })
      stream.on('error', reject)
      file.on('error', reject)
      file.on('finish', resolve)
      stream.pipe(file)
    })
    event.sender.send('update:progress', { received, total: total || received })
    return { ok: true, path: target }
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) }
  }
})

/** 用系统浏览器打开链接：只放行 https，避免被当成随便开程序的通道 */
ipcMain.handle('app:open-external', async (_event, url) => {
  if (!/^https:\/\//i.test(String(url))) return false
  await shell.openExternal(String(url))
  return true
})

ipcMain.handle('update:open', async (_event, filePath) => {
  const failure = await shell.openPath(String(filePath))
  return failure === ''
})

/** 只删我们自己下载的安装包，别碰用户下载目录里的其它东西 */
const UPDATE_INSTALLER = /^starburst-recorder-\d+\.\d+\.\d+-setup\.exe$/i

async function removeUpdateInstallers() {
  const dir = app.getPath('downloads')
  let bytes = 0
  let names
  try {
    names = await fs.promises.readdir(dir)
  } catch {
    return 0
  }
  for (const name of names) {
    if (!UPDATE_INSTALLER.test(name)) continue
    const file = path.join(dir, name)
    try {
      const stat = await fs.promises.stat(file)
      if (!stat.isFile()) continue
      await fs.promises.unlink(file)
      bytes += stat.size
    } catch {
      // 正在运行或没有权限就跳过；下次清理再说
    }
  }
  return bytes
}

ipcMain.handle('cache:clear', async () => {
  const bytes = await removeUpdateInstallers()
  await session.defaultSession.clearCache()
  return { bytes }
})

/**
 * 「数据在哪」：userData 是整个程序的数据目录，数据库文件就在它下面。
 * 给用户一个能亲眼看到的路径，「数据全在自己机器上」这句话才落到实处。
 */
ipcMain.handle('data:path', () => app.getPath('userData'))

ipcMain.handle('data:open-folder', async () => {
  const failure = await shell.openPath(app.getPath('userData'))
  return failure === '' // openPath 只有在失败时才返回一段错误说明
})

/**
 * 自检：设 STARBURST_SELFCHECK=1 启动时，会在页面加载完后探测
 * origin、IndexedDB 读写、手写体是否就位，打印结果后自动退出。
 * 这样打包环境是否正确不用靠肉眼确认。
 */
async function runSelfCheck(win) {
  const probe = `
    (async () => {
      const fontLoaded = await document.fonts.load('16px "LXGW WenKai Subset"').then(
        () => document.fonts.check('16px "LXGW WenKai Subset"'),
        () => false,
      )
      const idb = await new Promise((resolve) => {
        const request = indexedDB.open('starburst-selfcheck', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('kv')
        request.onerror = () => resolve('open-error')
        request.onsuccess = () => {
          const db = request.result
          db.transaction('kv', 'readwrite').objectStore('kv').put('ok', 'probe')
          const read = db.transaction('kv').objectStore('kv').get('probe')
          read.onsuccess = () => resolve(read.result === 'ok' ? 'readwrite-ok' : 'bad-value')
          read.onerror = () => resolve('read-error')
        }
      })
      const sqlite = await (async () => {
        if (!window.desktop?.db) return 'no-bridge'
        try {
          const totals = await window.desktop.db.call('totals', [])
          return 'ok:' + totals.entries + '/' + totals.stamps
        } catch (error) {
          return 'fail:' + error.message
        }
      })()
      return JSON.stringify({
        origin: location.origin,
        href: location.href,
        fontLoaded,
        idb,
        sqlite,
        title: document.title,
        rendered: Boolean(document.querySelector('#root')?.childElementCount),
      })
    })()
  `

  try {
    const result = await win.webContents.executeJavaScript(probe)
    // 打包后的 exe 用 GUI 子系统启动时看不到 stdout，所以同时写一份到文件
    const resultFile = path.join(os.tmpdir(), 'starburst-selfcheck.json')
    fs.writeFileSync(resultFile, result)
    console.log('[selfcheck]', result)
    console.log('[selfcheck-file]', resultFile)
  } catch (error) {
    console.error('[selfcheck-failed]', error)
  }
  app.quit()
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const target = assetPathFor(request.url)
    if (!target) return new Response('Not found', { status: 404 })
    return net.fetch(nodeUrl.pathToFileURL(target).toString())
  })

  const win = createWindow()
  createTray()

  if (process.env.STARBURST_SELFCHECK === '1') {
    win.webContents.once('did-finish-load', () => {
      void runSelfCheck(win)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 托盘常驻：窗口全关也不退出。真正结束只有「退出应用」这一条路
app.on('window-all-closed', () => {
  // 故意留空
})

// 放行窗口的 close：包括托盘菜单退出、系统注销、任务管理器之外的正常退出
app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  if (tray) {
    tray.destroy()
    tray = null
  }
  if (database) {
    database.close()
    database = null
  }
})
