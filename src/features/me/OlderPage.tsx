/**
 * 「长辈关怀」设置页（/me/older）。
 *
 * 字号档位独立生效（不开总开关字也能调大）；总开关带着四个关怀功能：
 * 加大点按区 / 高对比 / 减少动效 / 防误触（危险操作二次确认，见 ConfirmDialog）。
 * 状态存在 localStorage，样式挂在 <html> 的 data-* 上（见 src/shared/care/careMode.ts）。
 */
import { useCareMode } from '@/shared/care/careContext'
import { FONT_SCALES } from '@/shared/care/careMode'
import type { CareState } from '@/shared/care/careMode'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import { choiceTile } from '@/shared/ui/buttonStyles'

/** 一行「说明 + 开关」。开关是 role=switch 的拨钮，被 care-tap 的放大规则排除在外 */
function SwitchRow({
  title,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  title: string
  hint: string
  checked: boolean
  disabled?: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <div className={disabled ? 'flex items-center gap-3 opacity-50' : 'flex items-center gap-3'}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-brand bg-brand' : 'border-line bg-surface-2',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full transition-transform',
            checked ? 'translate-x-5 bg-on-brand' : 'translate-x-0 bg-muted',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

export default function OlderPage() {
  const { t } = useI18n()
  const { state, setFontScale, patch } = useCareMode()

  const features: {
    key: 'tapTargets' | 'contrast' | 'reduceMotion' | 'guard'
    title: MessageKey
    hint: MessageKey
  }[] = [
    { key: 'tapTargets', title: 'care.tapTargets', hint: 'care.tapTargetsHint' },
    { key: 'contrast', title: 'care.contrast', hint: 'care.contrastHint' },
    { key: 'reduceMotion', title: 'care.motion', hint: 'care.motionHint' },
    { key: 'guard', title: 'care.guard', hint: 'care.guardHint' },
  ]

  return (
    <PageShell
      title={t('me.care')}
      description={t('care.description')}
      backTo="/me"
      backLabel={t('me.title')}
      badge={<SettingBadge tone={state.care ? 'ok' : 'plain'}>{state.care ? t('care.badgeOn') : t('care.badgeOff')}</SettingBadge>}
    >
      <SettingCard>
        <SettingGroup label={t('care.masterGroup')} first>
          <SwitchRow
            title={t('care.master')}
            hint={t('care.masterHint')}
            checked={state.care}
            onToggle={(care) => patch({ care })}
          />
        </SettingGroup>

        <SettingGroup label={t('care.fontScale')}>
          <div className="grid grid-cols-4 gap-2">
            {FONT_SCALES.map((item) => {
              const active = state.fontScale === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFontScale(item.id)}
                  className={choiceTile(
                    active,
                    'flex flex-col items-center gap-1 px-2 py-2',
                  )}
                >
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                  <span className="text-xs opacity-80">
                    {t('care.scaleValue', { percent: item.percent })}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{t('care.fontScaleHint')}</p>
        </SettingGroup>
      </SettingCard>

      <SettingCard>
        <SettingGroup label={t('care.featuresGroup')} first>
          <div className="space-y-4">
            {features.map((item) => (
              <SwitchRow
                key={item.key}
                title={t(item.title)}
                hint={t(item.hint)}
                checked={state.care && state[item.key]}
                disabled={!state.care}
                onToggle={(next) => patch({ [item.key]: next } as Partial<CareState>)}
              />
            ))}
          </div>
          {!state.care && <p className="mt-3 text-xs text-muted">{t('care.featuresOff')}</p>}
        </SettingGroup>
      </SettingCard>

      {/* 首页入口简化还在计划里，先留一句话，免得有人专门来问 */}
      <p className="text-xs text-muted">{t('care.homeTodo')}</p>
    </PageShell>
  )
}
