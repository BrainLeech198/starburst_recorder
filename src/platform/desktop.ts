/**
 * 桌面壳（Electron）能力的统一契约。
 *
 * 预加载脚本会把 window.desktop 注入进来，浏览器里它是 undefined。
 * 类型只在这里声明一次：如果两个文件各写一份 `interface Window`，
 * TS 会因为「重复属性类型不一致」直接报错。
 */

/**
 * 一段图文内容。纯文字请求仍用字符串，只有需要让模型看图时才写成这种分段数组。
 * 形状照抄 OpenAI 的 content parts，识图服务商基本都是这一套。
 */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 模型要求调用某个工具；形状照抄 OpenAI 的 tool_calls */
export interface ChatToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 一条对话消息，形状跟 OpenAI 的 messages 一致 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** 带 tool_calls 的助手消息可以没有正文 */
  content: string | ChatContentPart[] | null
  /** 只在 assistant 消息上出现 */
  tool_calls?: ChatToolCall[]
  /** 只在 tool 消息上出现，对应哪一次调用 */
  tool_call_id?: string
}

export interface ChatRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  /** 可选采样参数：不传就走模型默认；每次请求换 seed 能避免重复模板 */
  temperature?: number
  seed?: number
  /** function calling 的工具声明；不支持 tool 的模型干脆不发 */
  tools?: unknown[]
  tool_choice?: 'auto'
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
  /** 从主进程拉服务商的模型列表（GET {baseUrl}/models），同样绕开 CORS */
  models: (request: { baseUrl: string; apiKey: string }) => Promise<ChatTransportResult>
  /** 数据实际落盘的位置（桌面程序里才有，浏览器里 null） */
  dataPath: () => Promise<string | null>
  /** 用系统文件管理器打开那个目录，返回是否成功 */
  openDataFolder: () => Promise<boolean>
  /**
   * 本地 SQLite 通道。方法名和参数由主进程白名单校验，
   * 渲染进程拿到的仍然是可以结构化克隆的普通对象。
   */
  db: {
    call: (method: string, args: unknown[]) => Promise<unknown>
    /** 数据库文件的实际路径，给「数据在哪」显示用 */
    path: () => Promise<string | null>
  }
  /** 「快速记一笔」小窗专用：关掉窗口、并让其他窗口刷新 */
  quick: {
    close: () => Promise<void>
    notifyChange: () => void
  }
  /** 其他窗口写了数据时触发；返回退订函数 */
  onDbChanged: (listener: () => void) => () => void
  /** 用系统浏览器打开 https 链接 */
  openExternal: (url: string) => Promise<boolean>
  /** 清理临时缓存：HTTP 缓存与已下载的更新安装包 */
  cache: {
    clear: () => Promise<{ bytes: number }>
  }
  /** 检查更新与下载安装包：走主进程，避开 CORS 和渲染进程的网络栈 */
  update: {
    check: (locale: string) => Promise<DesktopUpdateInfo | null>
    download: (url: string, fileName: string) => Promise<DesktopUpdateResult>
    /** 下载完成后拉起安装程序并退出应用；成功返回 true */
    install: (filePath: string) => Promise<boolean>
    /** 下载进度（主进程按秒推），返回退订函数 */
    onProgress: (listener: (progress: DesktopUpdateProgress) => void) => () => void
  }
}

/** 主进程回的「有新版本」信息，形状与 features/update 里的 UpdateInfo 一致 */
export interface DesktopUpdateInfo {
  version: string
  notes: string
  pageUrl: string
  downloadUrl: string
  fallbackUrl?: string
  fileName: string
}

export interface DesktopUpdateResult {
  ok: boolean
  path?: string
  error?: string
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


/** 下载进度：received 已写盘字节数，total 为 0 表示服务端没给长度 */
export interface DesktopUpdateProgress {
  received: number
  total: number
}
