/**
 * 从手机健康应用（Health Connect）导入体重与睡眠的弹窗。
 *
 * 只在安卓原生端出现。读到的数据先列出来，用户点「导入」才写库：
 * 体重按天去重、睡眠一夜一条，已经记过的日子直接跳过，不覆盖手记的内容。
 */
import { useEffect, useState } from 'react'
import type { WeighIn } from '@/core/db/schema'
import { newCode, newId } from '@/core/utils/id'
import { formatDate } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { formatNum } from './healthMath'
import {
  healthProfile,
  saveHealthProfile,
  saveHealthSleep,
  sleepOfDay,
} from './healthRepo'
import {
  DEVICE_IMPORT_DAYS,
  openHealthConnect,
  readDeviceHealth,
  requestDeviceHealthAccess,
  type DeviceHealthSnapshot,
} from './deviceHealth'
import type { ImportedSleep, ImportedWeight } from './deviceHealthMap'

/** 追加导入的体重：已有的日子跳过，新的按日期倒序排好，再回填「最新体重」 */
async function importWeights(list: ImportedWeight[]): Promise<number> {
  const base = await healthProfile()
  if (!base) return 0
  const known = new Set((base.weighIns ?? []).map((item) => item.dateKey))
  const fresh = list.filter((item) => !known.has(item.dateKey))
  if (fresh.length === 0) return 0

  const incoming: WeighIn[] = fresh.map((item) => ({
    dateKey: item.dateKey,
    weightKg: item.weightKg,
    createdAt: item.createdAt,
  }))
  const weighIns = [...incoming, ...(base.weighIns ?? [])]
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, 120)
  const newest = weighIns.reduce<WeighIn | null>(
    (acc, item) => (acc === null || item.dateKey > acc.dateKey ? item : acc),
    null,
  )
  await saveHealthProfile({
    ...base,
    weighIns,
    weightKg: newest ? newest.weightKg : base.weightKg,
    weightAt: newest ? newest.createdAt : base.weightAt,
    updatedAt: Date.now(),
  })
  return fresh.length
}

/** 导入睡眠：一夜一行，已有记录的那一夜跳过；夜醒按导入的分段汇总 */
async function importSleeps(list: ImportedSleep[]): Promise<number> {
  let count = 0
  for (const item of list) {
    if (await sleepOfDay(item.dateKey)) continue
    const now = Date.now()
    const wakeEvents = item.wakeEvents
    await saveHealthSleep({
      id: newId(),
      code: newCode(),
      dateKey: item.dateKey,
      bedtime: item.bedtime,
      wakeTime: item.wakeTime,
      quality: null,
      wakeEvents,
      naps: [],
      wakeCount: wakeEvents.length > 0 ? wakeEvents.length : null,
      wakeMinutes:
        wakeEvents.length > 0
          ? wakeEvents.reduce((sum, event) => sum + event.minutes, 0)
          : null,
      note: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    count += 1
  }
  return count
}

export default function HealthDeviceImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { showToast } = useToast()
  /** null = 还在读 */
  const [snapshot, setSnapshot] = useState<DeviceHealthSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wantWeights, setWantWeights] = useState(true)
  const [wantSleeps, setWantSleeps] = useState(true)

  function applySnapshot(next: DeviceHealthSnapshot) {
    setSnapshot(next)
    setWantWeights(next.weights.length > 0)
    setWantSleeps(next.sleeps.length > 0)
  }

  async function load() {
    try {
      applySnapshot(await readDeviceHealth())
    } catch {
      setFailed(true)
    }
  }

  /** 重试：先把状态清回「读取中」，再重新读 */
  function retry() {
    setFailed(false)
    setSnapshot(null)
    void load()
  }

  useEffect(() => {
    readDeviceHealth()
      .then(applySnapshot)
      .catch(() => setFailed(true))
  }, [])

  async function authorize() {
    setBusy(true)
    try {
      await requestDeviceHealthAccess()
      await load()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    if (!snapshot || busy) return
    setBusy(true)
    try {
      const weights = wantWeights ? await importWeights(snapshot.weights) : 0
      const sleeps = wantSleeps ? await importSleeps(snapshot.sleeps) : 0
      showToast({ message: t('health.deviceDone', { weights, sleeps }) })
      onClose()
    } catch {
      showToast({ message: t('health.deviceFailed') })
    } finally {
      setBusy(false)
    }
  }

  const latestWeight = snapshot?.weights[0] ?? null
  const latestSleep = snapshot?.sleeps[0] ?? null
  const nothing = snapshot === null || snapshot.weights.length + snapshot.sleeps.length === 0

  return (
    <Modal size="sm" label={t('health.deviceTitle')} onClose={onClose}>
      <h2 className="text-base font-medium">{t('health.deviceTitle')}</h2>
      <p className="mt-1 text-xs text-muted">{t('health.deviceDesc')}</p>

      {snapshot === null && !failed && (
        <p className="mt-4 text-xs text-muted">
          {t('health.deviceLoading', { n: DEVICE_IMPORT_DAYS })}
        </p>
      )}

      {failed && (
        <>
          <p className="mt-4 text-xs text-warning">{t('health.deviceFailed')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={retry} className={SOLID_BUTTON}>
              <Icon name="refresh" />
              {t('health.deviceRetry')}
            </button>
          </div>
        </>
      )}

      {snapshot?.status === 'unavailable' && (
        <>
          <p className="mt-4 text-xs text-muted">{t('health.deviceUnavailable')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void openHealthConnect()}
              className={SOLID_BUTTON}
            >
              <Icon name="settings" />
              {t('health.deviceSettings')}
            </button>
          </div>
        </>
      )}

      {snapshot?.status === 'denied' && (
        <>
          <p className="mt-4 text-xs text-muted">{t('health.deviceDenied')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void authorize()}
              className={SOLID_BUTTON + ' disabled:opacity-40'}
            >
              <Icon name="check" />
              {t('health.deviceAuthorize')}
            </button>
          </div>
        </>
      )}

      {snapshot?.status === 'ok' && (
        <>
          {nothing ? (
            <p className="mt-4 text-xs text-muted">
              {t('health.deviceEmpty', { n: DEVICE_IMPORT_DAYS })}
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {latestWeight && (
                <button
                  type="button"
                  aria-pressed={wantWeights}
                  onClick={() => setWantWeights((open) => !open)}
                  className={choiceTile(
                    wantWeights,
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-sm',
                  )}
                >
                  <span>{t('health.deviceWeights', { n: snapshot.weights.length })}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {t('health.deviceRecent', {
                      date: formatDate(latestWeight.dateKey, t),
                      value: formatNum(latestWeight.weightKg),
                    })}
                  </span>
                </button>
              )}
              {latestSleep && (
                <button
                  type="button"
                  aria-pressed={wantSleeps}
                  onClick={() => setWantSleeps((open) => !open)}
                  className={choiceTile(
                    wantSleeps,
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-sm',
                  )}
                >
                  <span>{t('health.deviceSleeps', { n: snapshot.sleeps.length })}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {t('health.deviceRecent', {
                      date: formatDate(latestSleep.dateKey, t),
                      value: `${latestSleep.bedtime} → ${latestSleep.wakeTime}`,
                    })}
                  </span>
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || nothing || (!wantWeights && !wantSleeps)}
              onClick={() => void handleImport()}
              className={SOLID_BUTTON + ' disabled:opacity-40'}
            >
              <Icon name="import" />
              {t('health.deviceImport')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
