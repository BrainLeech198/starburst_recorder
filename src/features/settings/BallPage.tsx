/**
 * 「悬浮球」二级页：形象 + 大小。
 *
 * 形象格子里直接画真的 Mascot，用的是当前主题色——所见即所得，不用想象。
 */
import { MASCOT_SHAPES, MASCOT_SIZES, useBall } from '@/app/providers/BallProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { Mascot } from '@/features/assistant/Mascot'
import { useI18n } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { choiceTile } from '@/shared/ui/buttonStyles'
import { compressImage } from '@/features/ai/aiVision'
import { useRef, useState } from 'react'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'

export default function BallPage() {
  const { prefs, setPrefs } = useBall()
  const { accent } = useTheme()
  const { t } = useI18n()
  const imageRef = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState('')

  const shapeOption = MASCOT_SHAPES.find((item) => item.id === prefs.shape)
  const shapeLabel = shapeOption ? t(shapeOption.labelKey) : prefs.shape
  const sizeOption = MASCOT_SIZES.find((item) => item.id === prefs.size)
  const sizeLabel = sizeOption ? t(sizeOption.labelKey) : prefs.size

  return (
    <PageShell
      title={t('agent.ball')}
      backTo="/me/agent"
      backLabel={t('me.agent')}
      badge={
        <SettingBadge>
          {shapeLabel} · {sizeLabel}
        </SettingBadge>
      }
      description={t('ball.description')}
    >
      <SettingCard>
        <SettingGroup label={t('ball.customImage')} first>
          <div className="flex items-center gap-3">
            {prefs.image ? <img src={prefs.image} alt="" className="h-14 w-14 rounded-full border border-line object-cover" /> : <Mascot shape={prefs.shape} color={accent} size={56} />}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => imageRef.current?.click()} className={OUTLINE_BUTTON}>{t(prefs.image ? 'ball.replaceImage' : 'ball.uploadImage')}</button>
              {prefs.image && <button type="button" onClick={() => setPrefs({ image: null })} className={OUTLINE_BUTTON}>{t('ball.resetImage')}</button>}
            </div>
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setImageError('')
              void compressImage(file).then((image) => setPrefs({ image })).catch(() => setImageError(t('ball.imageFailed')))
            }} />
          </div>
          {imageError && <p className="mt-2 text-xs text-danger">{imageError}</p>}
        </SettingGroup>
        <SettingGroup label={t('ball.shape')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MASCOT_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                onClick={() => setPrefs({ shape: shape.id })}
                className={choiceTile(
                  prefs.shape === shape.id,
                  'flex flex-col items-center gap-1 py-2',
                )}
              >
                <Mascot shape={shape.id} color={accent} size={30} />
                <span className="text-xs">{t(shape.labelKey)}</span>
              </button>
            ))}
          </div>
        </SettingGroup>

        <SettingGroup label={t('ball.size')}>
          <div className="grid grid-cols-3 gap-2">
            {MASCOT_SIZES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPrefs({ size: item.id })}
                className={choiceTile(prefs.size === item.id, 'py-2')}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
