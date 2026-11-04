/**
 * 分享弹窗：二维码 + 分享码 + 文件导出。
 *
 * 二维码放的是**去掉照片**的版本——照片几十 KB，二维码装不下；
 * 带照片的完整内容走「复制分享码 / 保存分享文件」，接收端按同一个协议解析。
 */
import { useEffect, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { describeSave, saveBinaryFile, saveTextFile } from '@/platform/saveFile'
import { renderSVG } from 'uqr'
import {
  encodeShare,
  fitsShareQr,
  hasSharePhotos,
  stripSharePhotos,
  type ShareDoc,
} from './shareCode'
import { renderRecordCardImage } from './recordCardImage'

type QrState = { kind: 'ready'; svg: string } | { kind: 'tooLarge' } | null
type RecordImageState =
  | { doc: ShareDoc; kind: 'ready'; bytes: Uint8Array }
  | { doc: ShareDoc; kind: 'error' }

async function svgToPng(svg: string): Promise<Uint8Array> {
  const image = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('png encode failed')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

function fileNameFor(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'share'
  return `${safe}.starburst-share`
}

/** 先走 Clipboard API；老 WebView 没有就退回 textarea + execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走兜底
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  return ok
}

export default function ShareDialog({ doc, onClose }: { doc: ShareDoc; onClose: () => void }) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [code, setCode] = useState('')
  const [qr, setQr] = useState<QrState>(null)
  const [recordImageState, setRecordImageState] = useState<RecordImageState | null>(null)
  const [busy, setBusy] = useState(false)
  const recordImage = recordImageState?.doc === doc && recordImageState.kind === 'ready'
    ? recordImageState.bytes
    : null
  const recordImageFailed = recordImageState?.doc === doc && recordImageState.kind === 'error'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const full = await encodeShare(doc)
      const thin = await encodeShare(stripSharePhotos(doc))
      if (cancelled) return
      setCode(full)
      if (!fitsShareQr(thin)) {
        setQr({ kind: 'tooLarge' })
        return
      }
      try {
        setQr({
          kind: 'ready',
          svg: renderSVG(thin, {
            ecc: 'M',
            // Keep the full four-module quiet zone; chat apps often crop or resize images.
            border: 4,
            pixelSize: 10,
            whiteColor: '#ffffff',
            blackColor: '#111111',
          }),
        })
      } catch {
        setQr({ kind: 'tooLarge' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doc])

  // 先在弹窗打开时生成卡片；点击保存时可以立即调用系统分享面板，保留 iOS 用户手势。
  useEffect(() => {
    let cancelled = false
    void renderRecordCardImage(doc, t)
      .then((bytes) => {
        if (!cancelled) setRecordImageState({ doc, kind: 'ready', bytes })
      })
      .catch(() => {
        if (!cancelled) setRecordImageState({ doc, kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [doc, t])

  async function handleCopy() {
    if (!code) return
    const ok = await copyText(code)
    showToast({ message: t(ok ? 'share.copied' : 'share.copyFailed') })
  }

  async function handleSave() {
    if (!code) return
    setBusy(true)
    try {
      const outcome = await saveTextFile({
        filename: fileNameFor(doc.title),
        mime: 'application/json',
        content: code,
      })
      showToast({ message: describeSave(outcome, doc.title, t) })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveQr() {
    if (qr?.kind !== 'ready') return
    setBusy(true)
    try {
      const safe = doc.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'share'
      const bytes = await svgToPng(qr.svg)
      const filename = `${safe}-qr.png`
      const outcome = await saveBinaryFile({ filename, mime: 'image/png', bytes })
      showToast({ message: describeSave(outcome, filename, t) })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveRecordImage() {
    if (!recordImage) return
    const safe = doc.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'record'
    const filename = `${safe}-record.png`
    setBusy(true)
    try {
      const saving = saveBinaryFile({ filename, mime: 'image/png', bytes: recordImage })
      const outcome = await saving
      showToast({ message: describeSave(outcome, filename, t) })
    } catch {
      showToast({ message: t('share.recordImageFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal size="sm" label={t('share.title', { name: doc.title })} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('share.title', { name: doc.title })}</h2>

      <div className="mt-4 flex min-h-40 items-center justify-center">
        {qr === null ? null : qr.kind === 'tooLarge' ? (
          <p className="m-0 text-center text-xs text-muted">{t('share.qrTooLarge')}</p>
        ) : (
          <div
            aria-label={t('share.qrHint')}
            className="w-full max-w-[240px] [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr.svg }}
          />
        )}
      </div>

      <p className="m-0 mt-1 text-center text-xs text-muted">{t('share.qrHint')}</p>
      {hasSharePhotos(doc) && (
        <p className="m-0 mt-1 text-center text-xs text-muted">{t('share.qrNoPhoto')}</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!code}
          className={`${SOLID_BUTTON} disabled:opacity-40`}
        >
          <Icon name="copy" />
          {t('share.copy')}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!code || busy}
          className={`${OUTLINE_BUTTON} disabled:opacity-40`}
        >
          <Icon name="download" />
          {t('share.saveFile')}
        </button>
        <button
          type="button"
          onClick={() => void handleSaveRecordImage()}
          disabled={!recordImage || busy}
          className={`${OUTLINE_BUTTON} disabled:opacity-40`}
        >
          <Icon name="download" />
          {t('share.saveRecordImage')}
        </button>
        {recordImageFailed && (
          <p role="alert" className="m-0 text-xs text-danger">
            {t('share.recordImageFailed')}
          </p>
        )}
        <button type="button" onClick={() => void handleSaveQr()} disabled={qr?.kind !== 'ready' || busy} className={`${OUTLINE_BUTTON} disabled:opacity-40`}>
          <Icon name="download" />
          {t('share.saveQrImage')}
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
