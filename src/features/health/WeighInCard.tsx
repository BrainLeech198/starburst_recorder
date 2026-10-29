/**
 * 「每周空腹称重」卡：定称重日和提醒时刻、记一次体重、看推算 TDEE 和最近记录。
 *
 * 这张卡直接落库（不走身体档案的草稿保存）：它是「记一笔」性质的操作，
 * 改完即存，免得跟档案表单的未保存状态搅在一起。
 */
import { useState } from 'react'
import type { HealthProfile } from '@/core/db/schema'
import { saveHealthProfile } from './healthRepo'
import { isWeighDay } from './healthMath'
import { todayKey, weekdayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useToast } from '@/app/providers/ToastProvider'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'

/** 1=周一 … 7=周日；date.weekdayShortN 的编号是 JS 的 0=周日，取个模对上 */
function weighDayLabelKey(day: number): MessageKey {
  return ('date.weekdayShort' + (day % 7)) as MessageKey
}

export default function WeighInCard({
  profile,
  derived,
}: {
  profile: HealthProfile | undefined
  derived: number | null | undefined
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [weightText, setWeightText] = useState('')

  async function saveSettings(patch: Partial<HealthProfile>) {
    if (!profile) return
    await saveHealthProfile({ ...profile, ...patch })
  }

  async function recordWeight() {
    const kg = Number(weightText)
    if (!profile || !Number.isFinite(kg) || kg <= 0) return
    const day = todayKey()
    const rounded = Math.round(kg * 10) / 10
    const weighIns = [
      { dateKey: day, weightKg: rounded, createdAt: Date.now() },
      ...(profile.weighIns ?? []).filter((item) => item.dateKey !== day),
    ].slice(0, 120)
    await saveHealthProfile({
      ...profile,
      weighIns,
      weightKg: rounded,
      weightAt: Date.now(),
    })
    setWeightText('')
    showToast({ message: t('health.weighSaved', { value: rounded }) })
  }

  const weighIns = profile?.weighIns ?? []
  const todayIsWeighDay = isWeighDay(todayKey(), profile?.weighDay ?? null)

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-fg">{t('health.weighTitle')}</h2>
      <p className="mt-1 text-xs text-muted">{t('health.weighHint')}</p>

      {todayIsWeighDay && (
        <p className="mt-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">
          {t('health.weighToday')}
        </p>
      )}

      <div className="mt-3">
        <div className="text-xs text-muted">{t('health.weighDayLabel')}</div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const active = profile?.weighDay === day
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                disabled={!profile}
                onClick={() => void saveSettings({ weighDay: active ? null : day })}
                className={choiceTile(active, 'px-1 py-2 text-center text-xs')}
              >
                {t(weighDayLabelKey(day))}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted">{t('health.weighTimeLabel')}</span>
          <input
            type="time"
            value={profile?.weighTime ?? '07:00'}
            disabled={!profile}
            onChange={(event) => void saveSettings({ weighTime: event.target.value || '07:00' })}
            className={INPUT + ' w-36'}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <input
            value={weightText}
            onChange={(event) => setWeightText(event.target.value)}
            inputMode="decimal"
            placeholder={t('health.weighUnit')}
            aria-label={t('health.weighRecord')}
            className={INPUT + ' w-32'}
          />
          <button
            type="button"
            onClick={() => void recordWeight()}
            disabled={!profile}
            className={SOLID_BUTTON}
          >
            {t('health.weighRecord')}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="text-xs text-muted">{t('health.derivedTitle')}</div>
        <div className="mt-1 text-xl font-medium tabular-nums text-fg">
          {derived ? t('health.derivedValue', { value: derived }) : t('health.derivedNone')}
        </div>
        <p className="mt-1 text-xs text-muted">{t('health.derivedHint')}</p>
      </div>

      {weighIns.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="text-xs text-muted">{t('health.weighHistory')}</div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {weighIns.slice(0, 5).map((item) => (
              <li key={item.dateKey} className="flex items-center justify-between">
                <span>
                  {item.dateKey} · {t(weekdayKey(item.dateKey))}
                </span>
                <span className="tabular-nums text-fg">{item.weightKg} kg</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
