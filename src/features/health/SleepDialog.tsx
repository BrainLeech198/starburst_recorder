/**
 * 记一夜睡眠的弹窗：就寝、起床、质量 1–5、备注。
 *
 * 归属日期 = 起床那天（dateKey 由外层给定，这里只显示不改）；
 * 时长是派生值，保存时不算、显示时才按跨零点算（sleepMath）。
 * 改动只在点「保存」时落库，跟日记编辑区一个口径。
 */
import { useState } from 'react'
import type { HealthSleep } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { sleepMinutes, sleepParts } from './sleepMath'
import { saveHealthSleep } from './healthRepo'

const QUALITIES = [1, 2, 3, 4, 5]

export default function SleepDialog({
  dateKey,
  sleep,
  onClose,
}: {
  /** 这一夜的归属日期（起床那天） */
  dateKey: string
  /** 这一夜已有记录时传入，弹窗变成编辑 */
  sleep: HealthSleep | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const [bedtime, setBedtime] = useState(sleep?.bedtime ?? '23:00')
  const [wakeTime, setWakeTime] = useState(sleep?.wakeTime ?? '07:00')
  const [quality, setQuality] = useState<number | null>(sleep?.quality ?? null)
  const [note, setNote] = useState(sleep?.note ?? '')

  const valid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(bedtime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime)
  const parts = valid ? sleepParts(sleepMinutes(bedtime, wakeTime)) : null

  async function handleSave() {
    if (!valid) return
    const now = Date.now()
    await saveHealthSleep(
      sleep
        ? { ...sleep, bedtime, wakeTime, quality, note }
        : {
            id: newId(),
            code: newCode(),
            dateKey,
            bedtime,
            wakeTime,
            quality,
            note,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
    )
    onClose()
  }

  return (
    <Modal
      size="sm"
      label={sleep ? t('health.sleepEditTitle') : t('health.sleepAddTitle')}
      onClose={onClose}
    >
      <h2 className="text-base font-medium">
        {sleep ? t('health.sleepEditTitle') : t('health.sleepAddTitle')}
      </h2>
      <p className="mt-1 text-xs text-muted">
        {t('health.sleepDateHint', { date: formatDate(dateKey, t) })}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">{t('health.sleepBedtime')}</span>
          <input
            type="time"
            value={bedtime}
            onChange={(event) => setBedtime(event.target.value)}
            className={INPUT + ' mt-1 w-full'}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">{t('health.sleepWake')}</span>
          <input
            type="time"
            value={wakeTime}
            onChange={(event) => setWakeTime(event.target.value)}
            className={INPUT + ' mt-1 w-full'}
          />
        </label>
      </div>

      {parts && (
        <p className="mt-2 text-xs text-muted">
          {t('health.sleepDuration', { h: parts.h, m: parts.m })}
        </p>
      )}

      <div className="mt-4">
        <span className="text-xs text-muted">{t('health.sleepQuality')}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {QUALITIES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={quality === value}
              onClick={() => setQuality(quality === value ? null : value)}
              className={choiceTile(quality === value, 'h-9 w-9 text-center tabular-nums')}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={quality === null}
            onClick={() => setQuality(null)}
            className={choiceTile(quality === null, 'h-9 px-3')}
          >
            {t('health.sleepQualityNone')}
          </button>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-xs text-muted">{t('health.sleepNote')}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className={INPUT + ' mt-1 w-full resize-none'}
        />
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => void handleSave()}
          className={SOLID_BUTTON + (valid ? '' : ' opacity-40')}
        >
          {t('health.sleepSave')}
        </button>
      </div>
    </Modal>
  )
}
