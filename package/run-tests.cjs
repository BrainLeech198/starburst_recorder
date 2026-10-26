/**
 * 跑单测的统一入口：node package/run-tests.cjs [vitest 参数…]
 *
 * 为什么要这层：Windows 的盘符大小写会把同一个 vitest 拆成两个 ESM 实例。
 * 启动入口（npx vitest / node_modules/.bin）拿到的是小写 d: 的路径，
 * 而测试文件里 import 'vitest' 走 Node 的 realpath 解析，拿到的是大写 D: 的路径——
 * URL 不同就是两个模块实例，runner 注入在前者，describe 定义在后者，
 * 一收集用例就崩在 initSuite 读 runner.config。
 * 这里把入口盘符规范成大写（Windows 盘符的规范写法，也和 ESM 解析器输出一致），
 * 两侧 URL 就一致了。Linux/macOS 没有盘符问题，原样透传。
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const packageJson = require.resolve('vitest/package.json')
const bin = require(packageJson).bin
const relativeEntry = typeof bin === 'string' ? bin : bin.vitest
let entry = path.join(path.dirname(packageJson), relativeEntry)
if (process.platform === 'win32') {
  entry = entry.replace(/^[a-z]:/, (drive) => drive.toUpperCase())
}

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
