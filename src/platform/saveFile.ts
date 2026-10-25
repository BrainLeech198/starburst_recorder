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
 *
 * 安卓侧**分块**传：一份 JSON 备份几 MB，一次性当参数穿过 Capacitor 桥，
 * 同一时刻会同时存在「原文 + base64 + 桥序列化副本 + Java String + 解码 byte[]」，
 * 低端机直接 OutOfMemoryError 闪退（2026-10-25 线上崩了）。分块之后任一时刻只有一小块。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { chunkToBase64 } from './textChunk'
import type { MessageParams } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

type Translate = (key: MessageKey, params?: MessageParams) => string

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
  begin(options: { filename: string; mime: string }): Promise<{ canceled: boolean; token?: number }>
  chunk(options: { token: number; data: string }): Promise<void>
  end(options: { token: number }): Promise<{ saved: boolean }>
}

const nativeSave = registerPlugin<SaveFileBridge>('SaveFile')

function inAndroidShell() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
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

  // 先让系统选择器弹出来；用户取消就什么都不传，省掉一次大对象的构建
  const begun = await nativeSave.begin({ filename: file.filename, mime: file.mime })
  if (begun.canceled || begun.token === undefined) return { kind: 'canceled' }

  const bytes = new TextEncoder().encode(file.content)
  for (const piece of chunkToBase64(bytes)) {
    await nativeSave.chunk({ token: begun.token, data: piece })
  }
  const done = await nativeSave.end({ token: begun.token })
  return done.saved ? { kind: 'saved' } : { kind: 'canceled' }
}

/**
 * 存完之后该跟用户说什么。别一律说"已导出"——
 * 用户在系统选择器里按了返回，就什么都没留下。
 */
export function describeSave(outcome: SaveOutcome, detail: string, t: Translate) {
  if (outcome.kind === 'downloaded') return t('data.savedDownloaded', { detail })
  if (outcome.kind === 'saved') return t('data.savedTo', { detail })
  return t('data.saveCanceled', { detail })
}
