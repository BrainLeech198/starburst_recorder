/**
 * 把一份文本存成文件——各平台各走各的路。
 *
 * 为什么不能只用 `<a download>`：**安卓 WebView 不处理 blob 链接的 download**。
 * 实测（2026-10-21）点「导出全部数据」后 blob 生成了、`a.click()` 也执行了，
 * 但 `/sdcard/Download` 里什么都没有，提示条却照样说"已导出"——等于骗用户。
 *
 * 为什么不用分享面板：那台测试机上没有任何应用能接收 JSON，面板直接提示
 * 「没有应用可执行此操作」——备份能不能存下来居然取决于装了什么 App。
 *
 * 所以安卓走系统自带的「保存到文件」选择器（SAF，见 android 侧的 SaveFilePlugin）：
 * 用户自己挑位置，不需要任何存储权限，也不依赖第三方应用。
 * 浏览器 / Windows 桌面壳照旧直接下载（那边 `<a download>` 是正常的）。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface TextFile {
  filename: string
  mime: string
  content: string
}

/** 存到哪儿了，调用方据此说人话，别一律说"已导出" */
export type SaveOutcome =
  /** 浏览器 / 桌面：直接落进下载目录 */
  | { kind: 'downloaded' }
  /** 安卓：用户挑好位置，字节已经写进去了 */
  | { kind: 'saved' }
  /** 安卓：用户在系统选择器里按了返回，文件没留下 */
  | { kind: 'canceled' }

/** android/app/src/main/java/com/starburst/recorder/SaveFilePlugin.java */
interface SaveFileBridge {
  save(options: { filename: string; mime: string; data: string }): Promise<{ saved: boolean }>
}

const nativeSave = registerPlugin<SaveFileBridge>('SaveFile')

function inAndroidShell() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** UTF-8 文本 → base64。安卓侧只收 base64 字符串，中文要先按 UTF-8 编码再转 */
function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // 分块拼接，避免一次展开太多参数把调用栈撑爆（长日记很容易超过这个量）
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function downloadInBrowser(file: TextFile) {
  const blob = new Blob([file.content], { type: file.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function saveTextFile(file: TextFile): Promise<SaveOutcome> {
  if (!inAndroidShell()) {
    downloadInBrowser(file)
    return { kind: 'downloaded' }
  }

  const result = await nativeSave.save({
    filename: file.filename,
    mime: file.mime,
    data: toBase64(file.content),
  })
  return result.saved ? { kind: 'saved' } : { kind: 'canceled' }
}

/**
 * 存完之后该跟用户说什么。别一律说"已导出"——
 * 用户在系统选择器里按了返回，就什么都没留下。
 */
export function describeSave(outcome: SaveOutcome, detail: string) {
  if (outcome.kind === 'downloaded') return `已导出 ${detail}`
  if (outcome.kind === 'saved') return `已保存 ${detail}`
  return `没有保存：你在保存对话框里取消了。再点一次「导出」可以重来（${detail}）`
}
