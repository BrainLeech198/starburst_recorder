import { useEffect, useMemo, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import { describeSave, saveBinaryFile } from '@/platform/saveFile'
import { renderAchievementCardImage } from './achievementCardImage'

export interface PostcardFact {
  id: string
  label: string
  value: string
  /** Optional fields start hidden; users choose explicitly before exporting. */
  optional?: boolean
  includedByDefault?: boolean
}

type ReadyCard = { key: string; bytes: Uint8Array; url: string }

function bytesBlob(bytes: Uint8Array): Blob {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([copy], { type: 'image/png' })
}

export default function AchievementPostcardDialog({
  title,
  dateLabel,
  facts,
  tone,
  onClose,
}: {
  title: string
  dateLabel: string
  facts: PostcardFact[]
  tone: 'training' | 'review'
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(facts.filter((fact) => fact.optional && fact.includedByDefault).map((fact) => fact.id)),
  )
  const [card, setCard] = useState<ReadyCard | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const visibleFacts = useMemo(
    () => facts.filter((fact) => !fact.optional || selected.has(fact.id)),
    [facts, selected],
  )
  const appName = t('app.name')
  const cardKey = JSON.stringify({ title, dateLabel, tone, appName, facts: visibleFacts })
  const visibleCard = card?.key === cardKey ? card : null
  const failed = failedKey === cardKey

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    void renderAchievementCardImage({
      title,
      dateLabel,
      facts: visibleFacts.map(({ label, value }) => ({ label, value })),
      tone,
    }, appName)
      .then((bytes) => {
        if (cancelled) return
        url = URL.createObjectURL(bytesBlob(bytes))
        setCard({ key: cardKey, bytes, url })
      })
      .catch(() => {
        if (!cancelled) setFailedKey(cardKey)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [title, dateLabel, tone, visibleFacts, appName, cardKey])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveCard() {
    if (!visibleCard) return
    const safe = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'postcard'
    setBusy(true)
    try {
      const filename = `${safe}-${dateLabel}.png`
      const outcome = await saveBinaryFile({ filename, mime: 'image/png', bytes: visibleCard.bytes })
      showToast({ message: describeSave(outcome, filename, t) })
    } catch {
      showToast({ message: t('share.recordImageFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal size="sm" label={t('share.title', { name: title })} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{title}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{dateLabel}</p>

      {facts.some((fact) => fact.optional) && (
        <fieldset className="mt-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-medium text-muted">{t('share.postcard.include')}</legend>
          <div className="flex flex-col gap-2">
            {facts.filter((fact) => fact.optional).map((fact) => (
              <label key={fact.id} className="flex items-start gap-2 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={selected.has(fact.id)}
                  onChange={() => toggle(fact.id)}
                  className="mt-0.5 accent-brand"
                />
                <span>{fact.label} · {fact.value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2 p-2">
        {visibleCard ? (
          <img
            src={visibleCard.url}
            alt={t('share.postcard.previewAlt')}
            className="mx-auto block max-h-[48vh] w-auto max-w-full rounded-lg object-contain"
          />
        ) : failed ? (
          <p role="alert" className="m-0 p-4 text-center text-xs text-danger">{t('share.recordImageFailed')}</p>
        ) : (
          <div aria-hidden="true" className="mx-auto aspect-[4/5] max-h-[48vh] animate-pulse rounded-lg bg-surface" />
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>{t('common.done')}</button>
        <button type="button" onClick={() => void saveCard()} disabled={!visibleCard || busy} className={`${OUTLINE_BUTTON} disabled:opacity-40`}>
          <Icon name="share" />
          {t('share.saveRecordImage')}
        </button>
      </div>
    </Modal>
  )
}
