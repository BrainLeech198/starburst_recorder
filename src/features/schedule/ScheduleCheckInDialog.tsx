import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { DiaryImage, ScheduleCheckIn } from '@/core/db/schema'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import ImageSourceDialog from '@/shared/ui/ImageSourceDialog'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { prepareImages } from '@/features/diary/imageAssets'

export default function ScheduleCheckInDialog({
  title,
  dateKey,
  existing,
  completed,
  onClose,
  onSave,
  onUndo,
}: {
  title: string
  dateKey: string
  existing: ScheduleCheckIn | null
  completed: boolean
  onClose: () => void
  onSave: (note: string, photo: DiaryImage | null) => Promise<void>
  onUndo: () => Promise<void>
}) {
  const { t } = useI18n()
  const [note, setNote] = useState(existing?.note ?? '')
  const [photo, setPhoto] = useState<DiaryImage | null>(existing?.photo ?? null)
  const [imageSourceOpen, setImageSourceOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  async function handleImageFiles(files: File[]) {
    if (files.length === 0 || imageBusy) return
    setImageBusy(true)
    setError('')
    try {
      const [image] = await prepareImages(files)
      if (image) setPhoto(image)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImageBusy(false)
    }
  }

  function handleImagePick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void handleImageFiles(files)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(note, photo)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('schedule.checkIn.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    setBusy(true)
    setError('')
    try {
      await onUndo()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('schedule.checkIn.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const label = t('schedule.checkIn.title')

  return (
    <>
      <Modal size="sm" label={label} onClose={busy ? undefined : onClose}>
        <div className="text-base font-medium text-fg">{label}</div>
        <div className="mt-1 text-xs text-muted">
          {formatDate(dateKey, t)} · {title}
        </div>

        <label className="mt-4 block text-xs font-medium text-muted" htmlFor="schedule-check-in-note">
          {t('schedule.checkIn.noteLabel')}
        </label>
        <textarea
          id="schedule-check-in-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          rows={4}
          maxLength={500}
          placeholder={t('schedule.checkIn.notePlaceholder')}
          className="mt-1 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        />
        <div className="mt-1 text-right text-[11px] text-muted">{note.length}/500</div>

        {photo ? (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-line bg-surface-2">
            <img src={photo.dataUrl} alt={t('schedule.checkIn.photoAlt')} className="max-h-56 w-full object-contain" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              aria-label={t('schedule.checkIn.removePhoto')}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setImageSourceOpen(true)}
            disabled={imageBusy || busy}
            className={`${OUTLINE_BUTTON} mt-3 w-full disabled:opacity-50`}
          >
            <Icon name="image" />
            {imageBusy ? t('schedule.checkIn.photoBusy') : t('schedule.checkIn.addPhoto')}
          </button>
        )}

        {error && <p role="alert" className="mb-0 mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {completed && (
            <button type="button" onClick={() => void undo()} disabled={busy} className={`${GHOST_BUTTON} mr-auto text-danger`}>
              {t('schedule.checkIn.undo')}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className={GHOST_BUTTON}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || imageBusy} className={`${SOLID_BUTTON} disabled:opacity-50`}>
            <Icon name="check" />
            {completed ? t('schedule.checkIn.update') : t('schedule.checkIn.complete')}
          </button>
        </div>
      </Modal>

      {imageSourceOpen && (
        <ImageSourceDialog
          onPickFile={() => imageInputRef.current?.click()}
          onTakePhoto={() => cameraInputRef.current?.click()}
          onClose={() => setImageSourceOpen(false)}
        />
      )}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImagePick} />
    </>
  )
}
