// 主进程日志：分级 + 模块标签 + 落盘。
//
// 与渲染层 `src/shared/log/log.ts` 是同一套行格式 `[时间戳] [级别] [标签] 消息`，
// 一条日志同时走两个通道：
//   1. 控制台（开发时看终端 / 打包后看调试输出）
//   2. <userData>/logs/log-YYYY-MM-DD_HH-mm-ss_NN.log 会话文件（每写一行立即落盘）
//
// 文件名与保留策略照工作室规范：日期与时间用 `_` 隔开，NN 是当天第几次启动（补零两位，
// 保证按文件名排序即时间序），默认保留最近 20 份。
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

/** 保留的日志文件上限，超出按文件名删最老，防手机上无限堆积 */
const MAX_LOG_FILES = 20

const ORDER = { debug: 0, info: 1, warn: 2, error: 3 }
const LABEL = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' }

/** 低于此级别的日志不打印也不落盘；打包后默认 Info，开发期全开 */
let minLevel = app.isPackaged ? 'info' : 'debug'
/** 落盘开关；文件打不开时自动关掉，避免每条日志都重试一次打开 */
let fileEnabled = true
/** 本次会话文件句柄，首次写日志时惰性打开 */
let fd = null
let filePath = ''

/** 日志目录：跟数据库同一个 userData 根，子目录名全小写（Linux / Android 区分大小写） */
function logsDir() {
  return path.join(app.getPath('userData'), 'logs')
}

/** 补零 */
function pad(value, width = 2) {
  return String(value).padStart(width, '0')
}

/** 时间戳：只到毫秒，日期由会话文件名承担 */
function stamp() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
}

/** 本次会话的文件名：log-YYYY-MM-DD_HH-mm-ss_NN.log */
function nextSessionPath() {
  const now = new Date()
  const prefix = `log-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_`
  let maxIndex = 0

  try {
    for (const name of fs.readdirSync(logsDir())) {
      if (!name.startsWith(prefix) || !name.endsWith('.log')) continue
      const middle = name.slice(prefix.length, -4)
      const sep = middle.lastIndexOf('_')
      if (sep < 0) continue
      const index = Number.parseInt(middle.slice(sep + 1), 10)
      if (Number.isFinite(index) && index > maxIndex) maxIndex = index
    }
  } catch {
    // 目录还不存在是正常情况，序号从 01 开始
  }

  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  return path.join(logsDir(), `${prefix}${time}_${pad(maxIndex + 1)}.log`)
}

/** 清理旧日志，保留最近 MAX_LOG_FILES 份（本次会话马上还要占一份，所以阈值减一） */
function trimOldLogs() {
  try {
    const logs = fs
      .readdirSync(logsDir())
      .filter((name) => name.startsWith('log-') && name.endsWith('.log'))
      .sort((a, b) => a.localeCompare(b))

    const removeCount = logs.length - (MAX_LOG_FILES - 1)
    for (let i = 0; i < removeCount; i += 1) {
      fs.rmSync(path.join(logsDir(), logs[i]), { force: true })
    }
  } catch {
    // 清理失败不影响写日志本身
  }
}

/** 惰性建目录 / 清理旧文件 / 开本次会话文件；打不开就彻底关掉落盘 */
function ensureFile() {
  if (fd !== null || !fileEnabled) return

  try {
    fs.mkdirSync(logsDir(), { recursive: true })
    trimOldLogs()
    filePath = nextSessionPath()
    fd = fs.openSync(filePath, 'a')
  } catch (error) {
    fileEnabled = false
    console.error(`[ERROR] [Log] 日志文件打开失败 | ${error.message}`)
    return
  }

  // 会话头只写文件、不走 write()：它不在控制台重复出现，也不带级别标签
  const now = new Date()
  fs.writeSync(fd, `===== 星芒记录者 会话开始 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} =====\n`)
  // 把绝对路径打到控制台：用户反馈「日志在哪」时不用去翻 AppData
  console.log(`[${stamp()}] [INFO ] [Log] 本次会话日志：${filePath}`)
}

/** 写一行到文件；失败一次就关掉落盘，避免刷日志时反复重试 */
function writeFile(line) {
  if (!fileEnabled) return
  ensureFile()
  if (fd === null) return

  try {
    fs.writeSync(fd, `${line}\n`)
  } catch {
    fileEnabled = false
  }
}

/** 总入口：够级别就拼统一行，先落盘再走控制台 */
function write(level, tag, message) {
  if (ORDER[level] < ORDER[minLevel]) return

  const line = `[${stamp()}] [${LABEL[level]}] [${tag}] ${message}`
  writeFile(line)

  if (level === 'warn') console.warn(line)
  else if (level === 'error') console.error(line)
  else if (level === 'debug') console.debug(line)
  else console.log(line)
}

/**
 * 渲染进程的 console 消息原样落盘。
 *
 * 渲染层已经按同一套格式拼好整行，这里不再加时间戳和级别，只补一句来源，
 * 保证文件里看到的行与窗口控制台逐字一致。
 */
function raw(message) {
  writeFile(`[renderer] ${message}`)
  console.log(`[renderer] ${message}`)
}

/** 开发期调试细节 */
function debug(tag, message) {
  write('debug', tag, message)
}

/** 正常运行轨迹 */
function info(tag, message) {
  write('info', tag, message)
}

/** 可疑但没坏 */
function warn(tag, message) {
  write('warn', tag, message)
}

/** 功能失败 */
function error(tag, message) {
  write('error', tag, message)
}

/** 启动时先落一次盘，保证「日志在哪」这句话在会话最开始就写进文件 */
function init() {
  ensureFile()
}

/** 进程退出前关掉句柄 */
function close() {
  if (fd === null) return
  try {
    fs.closeSync(fd)
  } catch {
    // 已经关掉就算了
  }
  fd = null
}

module.exports = { debug, info, warn, error, raw, init, close }
