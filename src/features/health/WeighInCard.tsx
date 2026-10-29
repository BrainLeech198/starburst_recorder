/**
 * 「每周空腹称重」卡：定称重日和提醒时刻、记一次体重、看推算 TDEE 和最近记录。
 *
 * 这张卡直接落库（不走身体档案的草稿保存）：它是「记一笔」性质的操作，
 * 改完即存，免得跟档案表单的未保存状态搅在一起。
 */
import { useState } from 'react'
import { Link } from 'react-router'
import type { HealthProfile } from '@/core/db/schema'
import { saveHealthProfile } from './healthRepo'
import { formatNum, isWeighDay, round2 } from './healthMath'
import { todayKey } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import { useToast } from '@/app/providers/ToastProvider'
import { INPUT } from '@/shared/ui/inputStyles'
import { SOLID_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import {
  TREND_RANGES,
  trendWeighIns,
  weightReviewKey,
  type TrendRange,
} from './healthViz'
import WeightTrendChart from './WeightTrendChart'

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
  /** 趋势图区间，默认看最近一周 */
  const [range, setRange] = useState<TrendRange>(7)

  async function recordWeight() {
    const kg = Number(weightText)
    if (!profile || !Number.isFinite(kg) || kg <= 0) return
    const day = todayKey()
    const rounded = round2(kg)
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
    showToast({ message: t('health.weighSaved', { value: formatNum(rounded) }) })
  }

  const weighIns = profile?.weighIns ?? []
  const todayIsWeighDay = isWeighDay(todayKey(), profile?.weighDay ?? null)
  const review = weightReviewKey(weighIns)
  const trend = trendWeighIns(weighIns, range, todayKey())

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden="true" className="mt-1 h-4 w-1 shrink-0 rounded-full bg-brand" />
          <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold leading-tight text-fg">
              {t('health.weighTitle')}
            </h2>
            <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{t('health.weighHint')}</p>
          </div>
        </div>
        <Link
          to="/health/weights"
          className="shrink-0 text-xs text-muted transition-colors hover:text-brand"
        >
          {t('health.viewRecords')} ›
        </Link>
      </div>
      {review && (
        <p className="mt-3 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">{t(review)}</p>
      )}

      {todayIsWeighDay && (
        <p className="mt-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">
          {t('health.weighToday')}
        </p>
      )}

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

      {weighIns.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">{t('health.trendTitle')}</span>
            <div className="flex items-center gap-1">
              {TREND_RANGES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={range === item}
                  onClick={() => setRange(item)}
                  className={choiceTile(range === item, 'px-2 py-1 text-[11px]')}
                >
                  {t('health.trendDays', { n: item })}
                </button>
              ))}
            </div>
          </div>
          <WeightTrendChart items={trend} />
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <div className="text-xs text-muted">{t('health.derivedTitle')}</div>
        <div className="mt-1 text-xl font-medium tabular-nums text-fg">
          {derived ? t('health.derivedValue', { value: derived }) : t('health.derivedNone')}
        </div>
        <p className="mt-1 text-xs text-muted">{t('health.derivedHint')}</p>
      </div>
    </div>
  )
}
