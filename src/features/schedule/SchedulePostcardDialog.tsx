import { useEffect, useMemo, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { formatDate } from '@/core/utils/dateKey'
import type { ScheduleItem } from '@/core/db/schema'
import { describeSave, saveBinaryFile } from '@/platform/saveFile'
import { buildDailyPostcardData, renderDailyPostcard } from './schedulePostcard'

type RenderState = { data: ReturnType<typeof buildDailyPostcardData>; dateKey: string; bytes: Uint8Array; url: string } | null
type FailureState = { data: ReturnType<typeof buildDailyPostcardData>; dateKey: string } | null

export default function SchedulePostcardDialog({
  items,
  dateKey,
  onClose,
}: {
  items: ScheduleItem[]
  dateKey: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const data = useMemo(() => buildDailyPostcardData(items, dateKey), [items, dateKey])
  const [rendered, setRendered] = useState<RenderState>(null)
  const [failedFor, setFailedFor] = useState<FailureState>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let canceled = false
    let url = ''
    void renderDailyPostcard(data, formatDate(dateKey, t), t)
      .then((bytes) => {
        if (canceled) return
        const copy = new Uint8Array(bytes)
        url = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }))
        setRendered({ data, dateKey, bytes, url })
      })
      .catch(() => {
        if (!canceled) setFailedFor({ data, dateKey })
      })
    return () => {
      canceled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [data, dateKey, t])

  async function save() {
    if (!rendered || rendered.data !== data || rendered.dateKey !== dateKey) return
    const filename = `starburst-daily-${dateKey}.png`
    setBusy(true)
    try {
      const outcome = await saveBinaryFile({ filename, mime: 'image/png', bytes: rendered.bytes })
      showToast({ message: describeSave(outcome, filename, t) })
    } catch {
      showToast({ message: t('schedule.postcard.saveFailed') })
    } finally {
      setBusy(false)
    }
  }

  const currentRender = rendered?.data === data && rendered.dateKey === dateKey ? rendered : null
  const failed = failedFor?.data === data && failedFor.dateKey === dateKey

  return (
    <Modal size="sm" label={t('schedule.postcard.title')} onClose={busy ? undefined : onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-medium text-fg">{t('schedule.postcard.title')}</h2>
          <p className="m-0 mt-1 text-xs text-muted">{formatDate(dateKey, t)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
          {t('schedule.postcard.progress', { done: data.done, total: data.total })}
        </span>
      </div>

      <div className="mt-4 flex max-h-[60vh] min-h-48 items-center justify-center overflow-auto rounded-2xl bg-surface-2 p-2">
        {currentRender ? (
          <img src={currentRender.url} alt={t('schedule.postcard.previewAlt')} className="h-auto w-full rounded-xl shadow-sm" />
        ) : failed ? (
          <p role="alert" className="m-0 text-center text-sm text-danger">{t('schedule.postcard.renderFailed')}</p>
        ) : (
          <p className="m-0 text-sm text-muted">{t('schedule.postcard.rendering')}</p>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={() => void save()} disabled={!currentRender || busy} className={`${SOLID_BUTTON} disabled:opacity-50`}>
          <Icon name="share" />
          {t('schedule.postcard.save')}
        </button>
      </div>
    </Modal>
  )
}
