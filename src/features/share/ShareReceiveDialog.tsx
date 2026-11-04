/**
 * 接收分享：扫码或粘贴分享码，先预览再导入。
 *
 * 预览只描述「将导入什么」，真正写库交给各类型的适配器；
 * 同名食物优先复用，避免把朋友的食物库覆盖成自己的。
 */
import { useState } from 'react'
import QrScanner from 'qr-scanner'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { INPUT } from '@/shared/ui/inputStyles'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { scanShareCode } from '@/platform/scanCode'
import { decodeShare, type ShareDoc } from './shareCode'
import { getShareAdapter } from './shareAdapters'

export default function ShareReceiveDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported?: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [doc, setDoc] = useState<ShareDoc | null>(null)
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  async function handleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setParsing(true)
    setError('')
    try {
      let value: string
      try {
        value = (await QrScanner.scanImage(file, { returnDetailedScanResult: true })).data
      } catch {
        // Messaging apps may resize the whole image until the QR modules are tiny.
        // Retry at the original resolution before reporting that no QR was found.
        value = (await QrScanner.scanImage(file, {
          disallowCanvasResizing: true,
          returnDetailedScanResult: true,
        })).data
      }
      setText(value)
      await parse(value)
    } catch {
      setError(t('share.qrImageUnreadable'))
    } finally {
      setParsing(false)
    }
  }

  async function parse(value: string) {
    const raw = value.trim()
    if (!raw) return
    setParsing(true)
    setError('')
    try {
      setDoc(await decodeShare(raw))
    } catch {
      setDoc(null)
      setError(t('share.invalid'))
    } finally {
      setParsing(false)
    }
  }

  async function handleScan() {
    setParsing(true)
    const value = await scanShareCode()
    setParsing(false)
    if (!value) return
    setText(value)
    await parse(value)
  }

  async function handleImport() {
    if (!doc) return
    setImporting(true)
    try {
      const message = await getShareAdapter(doc).import(doc, t)
      showToast({ message })
      onImported?.()
      onClose()
    } catch {
      showToast({ message: t('share.importFailed') })
    } finally {
      setImporting(false)
    }
  }

  const preview = doc ? getShareAdapter(doc).preview(doc, t) : []

  return (
    <Modal size="sm" label={t('share.receiveTitle')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('share.receiveTitle')}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{t('share.receiveDesc')}</p>

      <button
        type="button"
        onClick={() => void handleScan()}
        disabled={parsing}
        className={`${SOLID_BUTTON} mt-3 w-full disabled:opacity-40`}
      >
        <Icon name="scan" />
        {t('share.scan')}
      </button>

      <label className={`${OUTLINE_BUTTON} mt-2 w-full cursor-pointer`}>
        {t('share.chooseQrImage')}
        <input type="file" accept="image/*" onChange={(event) => void handleImage(event)} className="sr-only" disabled={parsing} />
      </label>

      <label className="mt-3 block text-xs text-muted" htmlFor="share-code-input">
        {t('share.pasteLabel')}
      </label>
      <textarea
        id="share-code-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('share.pastePlaceholder')}
        rows={4}
        className={`${INPUT} mt-1 font-mono text-[11px]`}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void parse(text)}
          disabled={!text.trim() || parsing}
          className={`${OUTLINE_BUTTON} disabled:opacity-40`}
        >
          <Icon name="check" />
          {t('share.parse')}
        </button>
      </div>

      {error && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}

      {doc && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="m-0 text-sm font-medium text-fg">{doc.title}</p>
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {preview.map((line, index) => (
              <li key={index} className="text-xs tabular-nums text-muted">
                {line}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing}
            className={`${SOLID_BUTTON} mt-3 w-full disabled:opacity-40`}
          >
            <Icon name="import" />
            {t('share.import')}
          </button>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  )
}
