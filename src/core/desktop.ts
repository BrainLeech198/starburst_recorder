/**
 * 桌面壳（Electron）能力的统一契约。
 *
 * 预加载脚本会把 window.desktop 注入进来，浏览器里它是 undefined。
 * 类型只在这里声明一次：如果两个文件各写一份 `interface Window`，
 * TS 会因为「重复属性类型不一致」直接报错。
 */

/** 一条对话消息，形状跟 OpenAI 的 messages 一致 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
}

/**
 * 一次请求的结果信封。
 * 桌面端（主进程）和开发转发都返回这个形状，
 * 于是「解析响应、把错误翻译成人话」这一套只用写一份。
 */
export interface ChatTransportResult {
  /** HTTP 层面是否成功（2xx） */
  ok: boolean
  /** HTTP 状态码；压根没连上时是 0 */
  status: number
  /** 服务商返回的原始响应体 */
  body: string
  /** 耗时，毫秒 */
  ms: number
  /** 没连上这类本地错误的原因（status 为 0 时才有） */
  error?: string
}

export interface DesktopBridge {
  isDesktop: boolean
  setSize: (width: number, height: number) => Promise<boolean>
  getSize: () => Promise<{ width: number; height: number } | null>
  /** 从主进程发 AI 请求：绕开 CORS，key 也不经过渲染进程的网络栈 */
  chat: (request: ChatRequest) => Promise<ChatTransportResult>
  /** 数据实际落盘的位置（桌面程序里才有，浏览器里 null） */
  dataPath: () => Promise<string | null>
  /** 用系统文件管理器打开那个目录，返回是否成功 */
  openDataFolder: () => Promise<boolean>
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/** 拿桌面壳的能力，浏览器里返回 undefined */
export function desktopBridge() {
  return window.desktop
}
