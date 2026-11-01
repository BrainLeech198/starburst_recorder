/**
 * 渲染层日志统一出口。
 *
 * 全项目只有这一个日志函数，不再直接写 `console.*`：
 * 分级 + 模块标签 + 统一行格式 `[时间戳] [级别] [标签] 消息`。
 *
 * 与工作室日志系统对齐的部分：Debug / Info / Warn / Error 四级、标签传所属模块、
 * 行格式定宽、调用处只传文案 key 与参数。桌面端由主进程监听窗口的 console 消息，
 * 原样落到 `logs/log-YYYY-MM-DD_HH-mm-ss_NN.log`；浏览器与 Android 只有控制台。
 */
import { LOG_TEXT, type LogKey } from './logText'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 级别的排序值，用来和最低级别比较 */
const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** 定宽 5 列，让各级日志在控制台里左对齐、好扫读 */
const LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
}

/** 低于此级别的日志直接丢掉；开发期全开，发布版只留 Info 以上 */
let minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info'

/** 运行时调整最低级别（调试时可临时放开 Debug） */
export function setLogLevel(level: LogLevel) {
  minLevel = level
}

/** 把 `{name}` 占位符换成参数值；缺参数的占位符原样保留，方便在控制台里一眼发现 */
function format(key: LogKey, params: Record<string, string | number>) {
  return LOG_TEXT[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** 时间戳：只到毫秒、不带日期——同一天的会话文件按文件名就能定位 */
function stamp() {
  const now = new Date()
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
}

/** 总入口：够级别就拼一行，交给对应的 console 通道 */
export function log(
  level: LogLevel,
  tag: string,
  key: LogKey,
  params: Record<string, string | number> = {},
) {
  if (ORDER[level] < ORDER[minLevel]) return

  const line = `[${stamp()}] [${LABEL[level]}] [${tag}] ${format(key, params)}`
  switch (level) {
    case 'debug':
      console.debug(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
    default:
      console.info(line)
  }
}

/** 开发期调试细节 */
export const logDebug = (tag: string, key: LogKey, params?: Record<string, string | number>) =>
  log('debug', tag, key, params)

/** 正常运行轨迹 */
export const logInfo = (tag: string, key: LogKey, params?: Record<string, string | number>) =>
  log('info', tag, key, params)

/** 可疑但没坏 */
export const logWarn = (tag: string, key: LogKey, params?: Record<string, string | number>) =>
  log('warn', tag, key, params)

/** 功能失败 */
export const logError = (tag: string, key: LogKey, params?: Record<string, string | number>) =>
  log('error', tag, key, params)
