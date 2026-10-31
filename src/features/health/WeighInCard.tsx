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
import { SOLID_SMALL_BUTTON, choiceTile } from '@/shared/ui/buttonStyles'
import {
  TREND_RANGES,
  trendWeighIns,
  weightReviewKey,
  type TrendRange,
} from './healthViz'
import WeightTrendChart from './WeightTrendChart'
import HealthEstimateNote from './HealthDisclaimer'

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
      {/* 指标卡式头部：小标题 + 右上角记录入口；称重日 / 提醒时刻的设置在记录页 */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-medium text-fg">{t('health.weighTitle')}</h2>
        <Link
          to="/health/weights"
          className="shrink-0 text-xs text-muted transition-colors hover:text-brand"
        >
          {t('health.viewRecords')} ›
        </Link>
      </div>

      {todayIsWeighDay && (
        <p className="m-0 mt-2 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
          {t('health.weighToday')}
        </p>
      )}
      {review && (
        <p className="m-0 mt-2 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs text-brand">
          {t(review)}
        </p>
      )}

      {/* 记体重 + 推算 TDEE：输入行只放输入和按钮，推算结果另起一行，窄屏不会把按钮挤掉 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={weightText}
          onChange={(event) => setWeightText(event.target.value)}
          inputMode="decimal"
          placeholder={t('health.weighUnit')}
          aria-label={t('health.weighRecord')}
          className={INPUT + ' w-24 min-w-0 flex-1 sm:w-28 sm:flex-none'}
        />
        <button
          type="button"
          onClick={() => void recordWeight()}
          disabled={!profile}
          className={SOLID_SMALL_BUTTON + ' shrink-0 disabled:opacity-40'}
        >
          {t('health.weighRecord')}
        </button>
      </div>
      <p className="m-0 mt-1.5 text-xs tabular-nums text-muted">
        {derived ? t('health.derivedLine', { value: formatNum(derived) }) : t('health.derivedNone')}
      </p>

      <HealthEstimateNote interactive className="mt-1.5" />

      {weighIns.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/health/weights/trend"
              className="text-xs text-muted transition-colors hover:text-brand"
            >
              {t('health.trendTitle')} ›
            </Link>
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
          {/* 整张图都能点开详情页：小卡片只放走势，细节留给趋势页 */}
          <Link to="/health/weights/trend" className="block">
            <WeightTrendChart items={trend} />
          </Link>
        </div>
      )}
    </div>
  )
}
