/**
 * 训练提醒设置：按计划（周几 + 时刻）与断档（连续 N 天没练）。
 *
 * 两个开关互相独立。保存时把原档案的其余字段一起带上，别覆盖丢数据；
 * 保存后立刻重排安卓本地通知，关掉就取消。
 */
import { useState } from 'react'
import type { HealthProfile, TrainingPlan } from '@/core/db/schema'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import Modal from '@/shared/ui/Modal'
import { GHOST_BUTTON, SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import { INPUT } from '@/shared/ui/inputStyles'
import { emptyProfile } from '@/features/health/healthMath'
import { saveHealthProfile } from '@/features/health/healthRepo'
import { planOfProfile } from './trainingPlan'
import { syncTrainingReminder } from './trainingNotify'

const NUDGE_OPTIONS = [2, 3, 5, 7]

/** 1=周一 … 7=周日 → 界面上的星期文案 */
function weekdayKey(day: number): MessageKey {
  return `date.weekday${day % 7}` as MessageKey
}

export default function TrainingPlanPanel({
  profile,
  onClose,
}: {
  profile: HealthProfile | undefined
  onClose: () => void
}) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [plan, setPlan] = useState<TrainingPlan>(() => planOfProfile(profile))
  const [error, setError] = useState('')

  const planOff = !plan.enabled

  function toggleDay(day: number) {
    setPlan((current) => ({
      ...current,
      weeklyDays: current.weeklyDays.includes(day)
        ? current.weeklyDays.filter((value) => value !== day)
        : [...current.weeklyDays, day].sort((a, b) => a - b),
    }))
  }

  async function save() {
    if (plan.enabled && plan.weeklyDays.length === 0) {
      setError(t('training.plan.daysEmpty'))
      return
    }
    const base = profile ?? emptyProfile()
    await saveHealthProfile({ ...base, trainingPlan: plan })
    await syncTrainingReminder(plan)
    showToast({ message: t('training.planSaved') })
    onClose()
  }

  return (
    <Modal size="sm" label={t('training.plan.title')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('training.plan.title')}</h2>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-fg">{t('training.plan.enabled')}</span>
        <button
          type="button"
          aria-pressed={plan.enabled}
          aria-label={t('training.plan.enabled')}
          onClick={() => setPlan((current) => ({ ...current, enabled: !current.enabled }))}
          className={choiceTile(
            plan.enabled,
            `px-3 py-1.5 text-xs ${plan.enabled ? 'bg-brand/10' : ''}`,
          )}
        >
          {plan.enabled ? '✓' : '—'}
        </button>
      </div>

      <div className={`mt-3 ${planOff ? 'opacity-50' : ''}`}>
        <span className="text-xs text-muted">{t('training.plan.days')}</span>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <button
              key={day}
              type="button"
              disabled={planOff}
              aria-pressed={plan.weeklyDays.includes(day)}
              onClick={() => toggleDay(day)}
              className={choiceTile(
                plan.weeklyDays.includes(day),
                'py-1.5 text-center text-[11px] disabled:opacity-50',
              )}
            >
              {t(weekdayKey(day))}
            </button>
          ))}
        </div>
      </div>

      <label className={`mt-3 block ${planOff ? 'opacity-50' : ''}`}>
        <span className="text-xs text-muted">{t('training.plan.time')}</span>
        <input
          type="time"
          value={plan.time}
          disabled={planOff}
          onChange={(event) => setPlan((current) => ({ ...current, time: event.target.value }))}
          className={`${INPUT} mt-1 w-full tabular-nums`}
        />
      </label>

      <div className="mt-4 border-t border-dashed border-line pt-3">
        <span className="text-xs text-muted">{t('training.plan.nudge')}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={plan.nudgeAfterDays === 0}
            onClick={() => setPlan((current) => ({ ...current, nudgeAfterDays: 0 }))}
            className={choiceTile(plan.nudgeAfterDays === 0, 'px-2.5 py-1.5 text-xs')}
          >
            {t('common.close')}
          </button>
          {NUDGE_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={plan.nudgeAfterDays === days}
              onClick={() => setPlan((current) => ({ ...current, nudgeAfterDays: days }))}
              className={choiceTile(plan.nudgeAfterDays === days, 'px-2.5 py-1.5 text-xs')}
            >
              {t('training.plan.nudgeDays', { n: days })}
            </button>
          ))}
        </div>
      </div>

      {error !== '' && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={() => void save()} className={SOLID_BUTTON}>
          <Icon name="check" />
          {t('training.save')}
        </button>
      </div>
    </Modal>
  )
}
