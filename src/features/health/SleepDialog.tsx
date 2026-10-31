/**
 * 记一夜睡眠的弹窗：就寝、起床、逐条夜醒、质量 1–5、备注。
 *
 * 归属日期 = 起床那天（dateKey 由外层给定，这里只显示不改）；
 * 时长是派生值，保存时不算、显示时才按跨零点算（sleepMath）。
 * 夜醒逐条记「几点醒 + 这次几分钟」，次数与累计分钟保存时由事件汇总；
 * 旧记录只有次数/分钟时照旧展示，补上具体时间后以新事件为准。
 * 改动只在点「保存」时落库，跟日记编辑区一个口径。
 */
import { useState } from 'react'
import type { HealthSleep } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import Modal from '@/shared/ui/Modal'
import {
  GHOST_BUTTON,
  ROW_DANGER,
  SOLID_BUTTON,
  SOLID_SMALL_BUTTON,
  choiceTile,
} from '@/shared/ui/buttonStyles'
import { INPUT } from '@/shared/ui/inputStyles'
import { sleepMinutes, sleepParts, sortWakeEvents } from './sleepMath'
import { saveHealthSleep } from './healthRepo'

const QUALITIES = [1, 2, 3, 4, 5]
/** 一夜最多记这么多次夜醒，跟导入时的上限保持一致 */
const MAX_WAKE_EVENTS = 20

/** 弹窗里的夜醒行：分钟先用字符串收着，允许用户清空重填 */
interface WakeDraft {
  time: string
  minutes: string
}

function isClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

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
  const [wakeDrafts, setWakeDrafts] = useState<WakeDraft[]>(
    (sleep?.wakeEvents ?? []).map((event) => ({
      time: event.time,
      minutes: String(event.minutes),
    })),
  )
  const [note, setNote] = useState(sleep?.note ?? '')

  /** 每分钟数留空或不是 0–1440 的整数都算没填好 */
  function wakeMinutesOf(text: string): number | null {
    if (text.trim() === '') return null
    const value = Number(text)
    if (!Number.isInteger(value) || value < 0 || value > 1440) return null
    return value
  }

  const wakeEvents = wakeDrafts.map((draft) => ({
    time: draft.time,
    minutes: wakeMinutesOf(draft.minutes),
  }))
  const wakeValid = wakeEvents.every((event) => isClock(event.time) && event.minutes !== null)

  const valid = isClock(bedtime) && isClock(wakeTime) && wakeValid
  const parts = valid ? sleepParts(sleepMinutes(bedtime, wakeTime)) : null

  /** 旧记录只有次数/分钟、还没有具体时间时，保存时不要把它抹掉 */
  const keepLegacyWake =
    sleep !== null &&
    (sleep.wakeEvents?.length ?? 0) === 0 &&
    (sleep.wakeCount !== null || sleep.wakeMinutes !== null)

  function addWake() {
    if (wakeDrafts.length >= MAX_WAKE_EVENTS) return
    setWakeDrafts((current) => [...current, { time: '', minutes: '0' }])
  }

  function updateWake(index: number, patch: Partial<WakeDraft>) {
    setWakeDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
    )
  }

  function removeWake(index: number) {
    setWakeDrafts((current) => current.filter((_, position) => position !== index))
  }

  async function handleSave() {
    if (!valid) return
    const now = Date.now()
    const events = sortWakeEvents(
      wakeEvents.map((event) => ({
        time: event.time,
        minutes: event.minutes ?? 0,
      })),
      bedtime,
    )
    // 有事件就以事件为准；没有事件时只在旧记录上保留原来的汇总
    const wakeCount = events.length > 0 ? events.length : keepLegacyWake ? sleep!.wakeCount : null
    const wakeMinutes =
      events.length > 0
        ? events.reduce((sum, event) => sum + event.minutes, 0)
        : keepLegacyWake
          ? sleep!.wakeMinutes
          : null
    const base = {
      bedtime,
      wakeTime,
      quality,
      wakeEvents: events,
      wakeCount,
      wakeMinutes,
      note,
    }
    await saveHealthSleep(
      sleep
        ? { ...sleep, ...base }
        : {
            id: newId(),
            code: newCode(),
            dateKey,
            ...base,
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

      {/* 夜醒：一次一行，记下几点醒、这次醒了几分钟；只是短暂醒来就填 0 */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{t('health.sleepWakeEvents')}</span>
          <button
            type="button"
            onClick={addWake}
            disabled={wakeDrafts.length >= MAX_WAKE_EVENTS}
            className={SOLID_SMALL_BUTTON + ' disabled:opacity-40'}
          >
            {t('health.sleepWakeAdd')}
          </button>
        </div>

        {wakeDrafts.length === 0 ? (
          <p className="m-0 mt-2 text-[11px] text-muted">{t('health.sleepWakeEmpty')}</p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] text-muted">
              <span>{t('health.sleepWakeAt')}</span>
              <span>{t('health.sleepWakeDuration')}</span>
              <span className="w-9" />
            </div>
            <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
              {wakeDrafts.map((draft, index) => (
                <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input
                    type="time"
                    value={draft.time}
                    aria-label={t('health.sleepWakeAt')}
                    onChange={(event) => updateWake(index, { time: event.target.value })}
                    className={INPUT + ' w-full tabular-nums'}
                  />
                  <input
                    value={draft.minutes}
                    inputMode="numeric"
                    aria-label={t('health.sleepWakeDuration')}
                    onChange={(event) => updateWake(index, { minutes: event.target.value })}
                    className={INPUT + ' w-full tabular-nums'}
                  />
                  <button
                    type="button"
                    aria-label={t('health.sleepWakeRemove')}
                    title={t('health.sleepWakeRemove')}
                    onClick={() => removeWake(index)}
                    className={ROW_DANGER + ' h-9 w-9 px-0 text-base'}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="m-0 mt-1 text-[11px] text-muted">{t('health.sleepWakeHint')}</p>
        {keepLegacyWake && wakeDrafts.length === 0 && (
          <p className="m-0 mt-1 text-[11px] text-warning">{t('health.sleepWakeLegacy')}</p>
        )}
      </div>

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
