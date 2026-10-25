// electron-builder 的 afterPack 钩子：往安装包里塞之前，先扔掉用不到的大文件。
//
// dxcompiler.dll / dxil.dll 是 Chromium 给 WebGPU（Dawn）编译着色器用的，
// 这个应用是普通网页界面，从不碰 WebGPU；两个文件加起来 27 MB，压完还能省下 9 MB 左右，
// 正好让安装包落回 Gitee 100 MB 的附件上限之内。
// default_app.asar 是 Electron 自带的示例应用，打包后永远不会被打开。
const fs = require('node:fs')
const path = require('node:path')

const DROP = ['dxcompiler.dll', 'dxil.dll', 'resources/default_app.asar']

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  for (const relative of DROP) {
    const file = path.join(context.appOutDir, relative)
    try {
      fs.rmSync(file, { force: true })
    } catch {
      // 有的 Electron 版本本来就没有这个文件，忽略
    }
  }
}

module.exports = afterPack
module.exports.default = afterPack
