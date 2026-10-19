// 预加载脚本：只把「窗口尺寸」和「AI 请求」两件事递给网页，其余一概不开
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  setSize: (width, height) => ipcRenderer.invoke('window:set-size', width, height),
  getSize: () => ipcRenderer.invoke('window:get-size'),
  // 由主进程代发，网页那边不用操心跨域
  chat: (request) => ipcRenderer.invoke('ai:chat', request),
})
