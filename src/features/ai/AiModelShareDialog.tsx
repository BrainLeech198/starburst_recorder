import { useState } from 'react'
import { renderSVG } from 'uqr'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { INPUT } from '@/shared/ui/inputStyles'
import { describeSave, saveBinaryFile, saveTextFile } from '@/platform/saveFile'
import { encryptText } from '@/features/settings/secretBox'
import type { AiModel } from './aiConfig'
import { encodeShare, fitsShareQr, SHARE_APP, SHARE_VERSION } from '@/features/share/shareCode'
import type { ShareAiModelDoc } from '@/features/share/shareCode'

type QrState = { kind: 'ready'; svg: string } | { kind: 'tooLarge' } | null

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
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('png encode failed'))), 'image/png'),
    )
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy clipboard path.
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

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ai-model'
}

export default function AiModelShareDialog({
  model,
  onClose,
}: {
  model: AiModel
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const hasKey = model.apiKey.trim() !== ''
  const [encryptKey, setEncryptKey] = useState(hasKey)
  const [passphrase, setPassphrase] = useState('')
  const [code, setCode] = useState('')
  const [qr, setQr] = useState<QrState>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function clearGenerated() {
    setCode('')
    setQr(null)
    setError('')
  }

  async function handleGenerate() {
    setError('')
    if (hasKey && encryptKey && !passphrase.trim()) {
      setError(t('share.aiModelPassRequired'))
      return
    }
    setBusy(true)
    try {
      const encryptedKey = hasKey && encryptKey
      const data: ShareAiModelDoc['data'] = {
        providerId: model.providerId,
        providerName: model.providerName,
        baseUrl: model.baseUrl,
        model: model.model,
        apiKey: encryptedKey ? await encryptText(model.apiKey, passphrase.trim()) : model.apiKey,
        apiKeyEncrypted: encryptedKey,
        vision: model.vision,
      }
      const doc: ShareAiModelDoc = {
        app: SHARE_APP,
        v: SHARE_VERSION,
        kind: 'aiModel',
        title: model.model,
        createdAt: Date.now(),
        data,
      }
      const nextCode = await encodeShare(doc)
      setCode(nextCode)
      if (!fitsShareQr(nextCode)) {
        setQr({ kind: 'tooLarge' })
        return
      }
      try {
        setQr({
          kind: 'ready',
          svg: renderSVG(nextCode, {
            ecc: 'M',
            border: 4,
            pixelSize: 10,
            whiteColor: '#ffffff',
            blackColor: '#111111',
          }),
        })
      } catch {
        setQr({ kind: 'tooLarge' })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    const ok = await copyText(code)
    showToast({ message: t(ok ? 'share.copied' : 'share.copyFailed') })
  }

  async function handleSaveCode() {
    const filename = `${safeName(model.model)}.starburst-share`
    const outcome = await saveTextFile({ filename, mime: 'application/json', content: code })
    showToast({ message: describeSave(outcome, filename, t) })
  }

  async function handleSaveQr() {
    if (qr?.kind !== 'ready') return
    setBusy(true)
    try {
      const bytes = await svgToPng(qr.svg)
      const filename = `${safeName(model.model)}-qr.png`
      const outcome = await saveBinaryFile({ filename, mime: 'image/png', bytes })
      showToast({ message: describeSave(outcome, filename, t) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal size="sm" label={t('share.aiModelTitle', { name: model.model })} onClose={busy ? undefined : onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('share.aiModelTitle', { name: model.model })}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{t('share.aiModelDesc')}</p>

      {hasKey && (
        <>
          <label className="mt-3 flex items-start gap-2 text-xs text-fg">
            <input
              type="checkbox"
              checked={encryptKey}
              onChange={(event) => {
                setEncryptKey(event.target.checked)
                clearGenerated()
              }}
              className="mt-0.5 accent-brand"
            />
            <span>{t('share.aiModelEncryptKey')}</span>
          </label>
          {encryptKey ? (
            <input
              type="password"
              value={passphrase}
              autoComplete="new-password"
              placeholder={t('share.aiModelPassphrase')}
              onChange={(event) => {
                setPassphrase(event.target.value)
                clearGenerated()
              }}
              className={`${INPUT} mt-2`}
            />
          ) : (
            <p className="m-0 mt-2 text-xs text-danger">{t('share.aiModelPlainWarning')}</p>
          )}
        </>
      )}

      {error && <p role="alert" className="m-0 mt-2 text-xs text-danger">{error}</p>}

      {qr?.kind === 'ready' && (
        <div className="mt-3 mx-auto w-full max-w-[240px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
      )}
      {qr?.kind === 'tooLarge' && <p className="m-0 mt-3 text-xs text-muted">{t('share.qrTooLarge')}</p>}
      {code && (
        <textarea
          aria-label={t('share.pasteLabel')}
          value={code}
          readOnly
          rows={4}
          className={`${INPUT} mt-3 font-mono text-[11px]`}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!code ? (
          <button type="button" onClick={() => void handleGenerate()} disabled={busy} className={`${SOLID_BUTTON} flex-1`}>
            {t('share.aiModelGenerate')}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void handleCopy()} className={`${SOLID_BUTTON} flex-1`}>
              <Icon name="copy" />
              {t('share.copy')}
            </button>
            <button type="button" onClick={() => void handleSaveCode()} disabled={busy} className={`${OUTLINE_BUTTON} flex-1`}>
              <Icon name="download" />
              {t('share.saveFile')}
            </button>
            <button type="button" onClick={() => void handleSaveQr()} disabled={qr?.kind !== 'ready' || busy} className={`${OUTLINE_BUTTON} flex-1`}>
              <Icon name="download" />
              {t('share.saveQrImage')}
            </button>
          </>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onClose} disabled={busy} className={GHOST_BUTTON}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}
