// 预加载脚本：只把「窗口尺寸」「AI 请求」「数据目录」「本地数据库」递给网页，其余一概不开
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  setSize: (width, height) => ipcRenderer.invoke('window:set-size', width, height),
  getSize: () => ipcRenderer.invoke('window:get-size'),
  // 由主进程代发，网页那边不用操心跨域
  chat: (request) => ipcRenderer.invoke('ai:chat', request),
  models: (request) => ipcRenderer.invoke('ai:models', request),
  dataPath: () => ipcRenderer.invoke('data:path'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  // 本地数据库只有这两个动作：按白名单调方法、拿文件路径
  db: {
    call: (method, args) => ipcRenderer.invoke('db:call', method, args),
    path: () => ipcRenderer.invoke('db:path'),
  },
  // 快速记一笔的小窗：记完自己关掉，并顺手通知其他窗口刷新
  quick: {
    close: () => ipcRenderer.invoke('quick:close'),
    notifyChange: () => ipcRenderer.send('db:notify'),
  },
  // 用系统浏览器打开链接（官网、Release 页）
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  // 清理临时缓存与更新安装包，不动数据库
  cache: {
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  // 检查更新与下载安装包：由主进程代劳，网页只拿到结果
  update: {
    check: (locale) => ipcRenderer.invoke('update:check', locale),
    download: (url, fileName) => ipcRenderer.invoke('update:download', url, fileName),
    install: (filePath) => ipcRenderer.invoke('update:install', filePath),
    onProgress: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    },
  },
  /** 别的窗口写了数据时触发，返回退订函数 */
  onDbChanged: (listener) => {
    const handler = () => listener()
    ipcRenderer.on('db:changed', handler)
    return () => ipcRenderer.removeListener('db:changed', handler)
  },
})
