/**
 * 把一份文本存成文件——各平台各走各的路。
 *
 * 为什么不能只用 `<a download>`：**安卓 WebView 不处理 blob 链接的 download**。
 * 实测（2026-10-21）点「导出全部数据」后 blob 生成了、`a.click()` 也执行了，
 * 但 `/sdcard/Download` 里什么都没有，提示条却照样说"已导出"——等于骗用户。
 *
 * 为什么安卓不用分享面板：那台测试机上没有任何应用能接收 JSON，面板直接提示
 * 「没有应用可执行此操作」——备份能不能存下来居然取决于装了什么 App。
 *
 * 所以安卓走系统自带的「保存到文件」选择器（SAF，见 android 侧的 SaveFilePlugin）：
 * 用户自己挑位置，不需要任何存储权限，也不依赖第三方应用。
 * 浏览器 / Windows 桌面壳照旧直接下载（那边 `<a download>` 是正常的）。
 *
 * **iOS 是反过来的一例**：`<a download>` 能落进「文件」App，但用户根本找不到它，
 * 而「分享面板」才是 iOS 用户熟悉的路径（存到「文件」、发微信、存相册）。
 * 所以只在 iPhone / iPad 的网页版上走分享面板，其它平台维持原样——
 * 桌面壳和安卓壳的行为不因为这个改动发生任何变化。
 *
 * 安卓侧**分块**传：一份 JSON 备份几 MB，一次性当参数穿过 Capacitor 桥，
 * 同一时刻会同时存在「原文 + base64 + 桥序列化副本 + Java String + 解码 byte[]」，
 * 低端机直接 OutOfMemoryError 闪退（2026-10-25 线上崩了）。分块之后任一时刻只有一小块。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { chunkToBase64 } from './textChunk'
import { isIosWebApp } from './pwa'
import type { MessageParams } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

type Translate = (key: MessageKey, params?: MessageParams) => string

export interface TextFile {
  filename: string
  mime: string
  content: string
}

/** 图片这类二进制文件：字节已经准备好，保存路径与文本一致 */
export interface BinaryFile {
  filename: string
  mime: string
  bytes: Uint8Array
}

/** 存到哪儿了，调用方据此说人话，别一律说"已导出" */
export type SaveOutcome =
  /** 浏览器 / 桌面：直接落进下载目录 */
  | { kind: 'downloaded' }
  /** iOS 网页版：交给系统分享面板，用户自己决定存到哪 */
  | { kind: 'shared' }
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

interface ShareNavigator {
  share?: (data: { files: File[]; title?: string }) => Promise<void>
  canShare?: (data: { files: File[] }) => boolean
}

/**
 * 能交给系统分享面板就交出去；返回 null 表示这条路走不通，调用方退回下载。
 *
 * 分享必须在用户手势的调用栈里发起：调用方要是有 `await` 卡在前面，
 * 浏览器会抛 NotAllowedError，这里同样返回 null 让它退回下载，不至于导出失败。
 * 用户在面板里按了取消是 AbortError，那是明确的"没保存"，要和失败区分开。
 */
async function tryShare(file: File): Promise<SaveOutcome | null> {
  if (!isIosWebApp()) return null
  const nav = navigator as unknown as ShareNavigator
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return null
  if (!nav.canShare({ files: [file] })) return null
  try {
    await nav.share({ files: [file] })
    return { kind: 'shared' }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return { kind: 'canceled' }
    return null
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function saveTextFile(file: TextFile): Promise<SaveOutcome> {
  if (!inAndroidShell()) {
    const blob = new Blob([file.content], { type: file.mime })
    const shared = await tryShare(new File([blob], file.filename, { type: file.mime }))
    if (shared) return shared
    downloadBlob(file.filename, blob)
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

/** 二进制文件（对话长图这类）：浏览器直接下载，安卓走同一套分块保存 */
export async function saveBinaryFile(file: BinaryFile): Promise<SaveOutcome> {
  if (!inAndroidShell()) {
    // 复制一份，避免 Uint8Array 的底层缓冲带偏移，Blob 读到多余字节
    const copy = new Uint8Array(file.bytes)
    const blob = new Blob([copy.buffer], { type: file.mime })
    const shared = await tryShare(new File([blob], file.filename, { type: file.mime }))
    if (shared) return shared
    downloadBlob(file.filename, blob)
    return { kind: 'downloaded' }
  }

  const begun = await nativeSave.begin({ filename: file.filename, mime: file.mime })
  if (begun.canceled || begun.token === undefined) return { kind: 'canceled' }

  for (const piece of chunkToBase64(file.bytes)) {
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
  if (outcome.kind === 'downloaded' || outcome.kind === 'shared') {
    return t('data.savedDownloaded', { detail })
  }
  if (outcome.kind === 'saved') return t('data.savedTo', { detail })
  return t('data.saveCanceled', { detail })
}
