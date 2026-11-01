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
import { describeSave, saveTextFile } from '@/platform/saveFile'
import { renderSVG } from 'uqr'
import {
  encodeShare,
  fitsShareQr,
  hasSharePhotos,
  stripSharePhotos,
  type ShareDoc,
} from './shareCode'

type QrState = { kind: 'ready'; svg: string } | { kind: 'tooLarge' } | null

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
  const [busy, setBusy] = useState(false)

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
            border: 2,
            pixelSize: 8,
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
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
