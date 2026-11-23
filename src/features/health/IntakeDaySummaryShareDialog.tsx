import { useEffect, useMemo, useState } from 'react'
import type { HealthIntake } from '@/core/db/schema'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { describeSave, saveBinaryFile } from '@/platform/saveFile'
import { formatDate } from '@/core/utils/dateKey'
import { formatNum, type Macros } from './healthMath'
import { renderIntakeSummaryImage } from './intakeSummaryImage'

type CardState = { key: string; bytes: Uint8Array; url: string } | { key: string; error: true }

function bytesBlob(bytes: Uint8Array) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([copy], { type: 'image/png' })
}

export default function IntakeDaySummaryShareDialog({
  onClose,
  dayKey,
  intakes,
  totals,
}: {
  onClose: () => void
  dayKey: string
  intakes: HealthIntake[]
  totals: Macros
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [card, setCard] = useState<CardState | null>(null)
  const [busy, setBusy] = useState(false)
  const dateLabel = formatDate(dayKey, t)
  const records = useMemo(
    () => [...intakes]
      .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt)
      .map((item) => ({
        time: item.time,
        name: item.name,
        grams: formatNum(item.grams),
        kcal: formatNum(item.kcal),
      })),
    [intakes],
  )
  const input = useMemo(() => ({
    title: t('health.shareDayTitle'),
    dateLabel,
    recordLabel: t('health.shareDayRecords', { n: records.length }),
    appName: t('app.name'),
    kcalLabel: t('health.shareDayKcal'),
    proteinLabel: t('health.legendProtein'),
    carbsLabel: t('health.legendCarbs'),
    fatLabel: t('health.legendFat'),
    kcalValue: `${formatNum(totals.kcal)} ${t('health.kcalUnit')}`,
    proteinValue: `${formatNum(totals.protein)} g`,
    carbsValue: `${formatNum(totals.carbs)} g`,
    fatValue: `${formatNum(totals.fat)} g`,
    records,
  }), [dateLabel, records, t, totals.carbs, totals.fat, totals.kcal, totals.protein])
  const cardKey = JSON.stringify(input)
  const visibleCard = card?.key === cardKey && 'bytes' in card ? card : null
  const failed = card?.key === cardKey && 'error' in card

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    void renderIntakeSummaryImage(input)
      .then((bytes) => {
        if (cancelled) return
        url = URL.createObjectURL(bytesBlob(bytes))
        setCard({ key: cardKey, bytes, url })
      })
      .catch(() => {
        if (!cancelled) setCard({ key: cardKey, error: true })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [cardKey, input])

  async function saveCard() {
    if (!visibleCard) return
    const filename = `intake-${dayKey}-summary.png`
    setBusy(true)
    try {
      const outcome = await saveBinaryFile({ filename, mime: 'image/png', bytes: visibleCard.bytes })
      showToast({ message: describeSave(outcome, filename, t) })
    } catch {
      showToast({ message: t('share.recordImageFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal size="sm" label={t('share.title', { name: input.title })} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{input.title}</h2>
      <p className="m-0 mt-1 text-xs text-muted">{dateLabel}</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2 p-2">
        {visibleCard ? (
          <img
            src={visibleCard.url}
            alt={t('share.postcard.previewAlt')}
            className="mx-auto block max-h-[48vh] w-auto max-w-full rounded-lg object-contain"
          />
        ) : failed ? (
          <p role="alert" className="m-0 p-4 text-center text-xs text-danger">
            {t('share.recordImageFailed')}
          </p>
        ) : (
          <div aria-hidden="true" className="mx-auto aspect-[4/5] max-h-[48vh] animate-pulse rounded-lg bg-surface" />
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.done')}
        </button>
        <button
          type="button"
          onClick={() => void saveCard()}
          disabled={!visibleCard || busy}
          className={`${OUTLINE_BUTTON} disabled:opacity-40`}
        >
          <Icon name="share" />
          {t('share.saveRecordImage')}
        </button>
      </div>
    </Modal>
  )
}
