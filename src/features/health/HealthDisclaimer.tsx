/**
 * 健康数字的免责提醒。
 *
 * TDEE、推算 TDEE 和食物热量都是估算，容易被当成测量值。做法分两层：
 * 数据旁常驻一行小字，点开看完整说明；第一次进健康页时弹一次完整说明，
 * 点「我知道了」后记在 localStorage，之后不再打扰。
 *
 * 弹窗里再嵌一个弹窗会被内外两层的 Esc 处理互相打架，所以嵌套场景
 * （记一笔摄入、AI 询问、助手）只用不带按钮的静态小字。
 */
import { useState } from 'react'
import Modal from '@/shared/ui/Modal'
import { SOLID_BUTTON } from '@/shared/ui/buttonStyles'
import { useI18n } from '@/shared/i18n/context'
import { acknowledgeDisclaimer } from './disclaimerAck'

export function HealthDisclaimerDialog({
  onClose,
  firstRun = false,
}: {
  onClose: () => void
  /** 首次进入：按钮改成「我知道了」并记住 */
  firstRun?: boolean
}) {
  const { t } = useI18n()
  const points = [
    t('health.disclaimerTdee'),
    t('health.disclaimerFood'),
    t('health.disclaimerMedical'),
    t('health.disclaimerEat'),
  ]

  return (
    <Modal size="sm" label={t('health.disclaimerTitle')} onClose={onClose}>
      <h2 className="m-0 text-base font-medium text-fg">{t('health.disclaimerTitle')}</h2>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-xs leading-relaxed text-muted">
            <span aria-hidden="true" className="text-brand">
              ·
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (firstRun) acknowledgeDisclaimer()
            onClose()
          }}
          className={SOLID_BUTTON}
        >
          {firstRun ? t('health.disclaimerAck') : t('common.close')}
        </button>
      </div>
    </Modal>
  )
}

/** 常驻小字；interactive 时点开完整说明，否则只提示不响应点击 */
export default function HealthEstimateNote({
  interactive = false,
  className = '',
}: {
  interactive?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const text = (
    <span className="mr-1" aria-hidden="true">
      ⓘ
    </span>
  )

  if (!interactive) {
    return (
      <p className={`m-0 text-[11px] text-muted ${className}`}>
        {text}
        {t('health.estimateNote')}
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`m-0 block text-left text-[11px] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-fg ${className}`}
      >
        {text}
        {t('health.estimateNote')}
      </button>
      {open && <HealthDisclaimerDialog onClose={() => setOpen(false)} />}
    </>
  )
}
