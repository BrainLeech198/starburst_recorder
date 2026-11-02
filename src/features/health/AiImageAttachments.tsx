/**
 * 健康表单里的「图片参考」列表。
 *
 * 第一次拍照识别的图会自动放进来；之后和 AI 聊时，这些图会一起发给模型。
 * 只存在当前表单的内存里，不写食物库、不进备份。
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useRef, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { compressImage } from '@/features/ai/aiVision'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import { takeNativePhoto, usesNativeCamera } from '@/platform/camera'
import { MAX_REFERENCE_IMAGES, addReferenceImage, removeReferenceImage } from './aiImages'

export default function AiImageAttachments({
  images,
  onChange,
}: {
  images: string[]
  onChange: (images: string[]) => void
}) {
  const { t } = useI18n()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const full = images.length >= MAX_REFERENCE_IMAGES

  async function add(file: File | undefined) {
    if (!file) return
    if (full) {
      setError(t('foods.aiAttachFull'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const dataUrl = await compressImage(file)
      onChange(addReferenceImage(images, dataUrl))
    } catch (failure) {
      setError((failure as Error).message || t('foods.photoFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function takePhoto() {
    if (!usesNativeCamera()) {
      cameraRef.current?.click()
      return
    }
    const shot = await takeNativePhoto()
    if (shot) void add(shot)
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs text-fg">{t('foods.aiAttachTitle')}</p>
          <p className="m-0 mt-0.5 text-[11px] text-muted">{t('foods.aiAttachHint')}</p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">
          {images.length}/{MAX_REFERENCE_IMAGES}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {images.map((image, index) => (
          <span key={`${index}-${image.slice(-16)}`} className="relative">
            <img
              src={image}
              alt={t('foods.aiAttachTitle')}
              className="h-12 w-12 rounded-lg border border-line object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(removeReferenceImage(images, index))}
              aria-label={t('foods.aiAttachRemove')}
              title={t('foods.aiAttachRemove')}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-[10px] text-muted transition-colors hover:text-danger"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={busy || full}
          onClick={() => setPicking(true)}
          className={`${OUTLINE_BUTTON} px-2 py-1 text-xs disabled:opacity-40`}
        >
          <Icon name="image" />
          {busy ? t('foods.photoUploading') : t('foods.aiAttachAdd')}
        </button>
      </div>

      {error !== '' && <ErrorNote>{error}</ErrorNote>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void add(file)
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void add(file)
        }}
      />

      {picking && (
        <ImageSourceDialog
          onPickFile={() => fileRef.current?.click()}
          onTakePhoto={() => void takePhoto()}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
