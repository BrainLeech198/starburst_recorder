// Electron 主进程：把打包好的网页装进一个真正的 Windows 窗口里。
//
// 这里刻意不用 file:// 直接打开 index.html，而是注册一个 app:// 协议：
// file:// 的 origin 是 opaque 的，ES module、fetch、IndexedDB 都可能被 CORS 或
// 存储策略拦住；给它一个标准的 origin（app://starburst）这些就都按常规工作。
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron')
const path = require('node:path')
const nodeUrl = require('node:url')

/** 窗口不能小于这个尺寸，免得版式被压坏 */
const MIN_WIDTH = 420
const MIN_HEIGHT = 560

const DIST = path.join(__dirname, '..', 'dist')
const APP_URL = 'app://starburst/index.html'

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
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
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

// 设置页里的「窗口尺寸」通过这两个通道生效
ipcMain.handle('window:set-size', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  const nextWidth = Math.max(MIN_WIDTH, Math.round(Number(width) || 0))
  const nextHeight = Math.max(MIN_HEIGHT, Math.round(Number(height) || 0))
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
      return JSON.stringify({
        origin: location.origin,
        href: location.href,
        fontLoaded,
        idb,
        title: document.title,
        rendered: Boolean(document.querySelector('#root')?.childElementCount),
      })
    })()
  `

  try {
    const result = await win.webContents.executeJavaScript(probe)
    console.log('[selfcheck]', result)
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

  if (process.env.STARBURST_SELFCHECK === '1') {
    win.webContents.once('did-finish-load', () => {
      void runSelfCheck(win)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
